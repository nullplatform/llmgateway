import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config/index.js';
import type { ApiKeyItem, ApiKey, CreateKeyResult, ValidateKeyResult } from '../types/index.js';

const API_KEY_PREFIX = 'nll_';

/**
 * DynamoDB client configured with region from config
 * Supports local DynamoDB via DYNAMODB_ENDPOINT env var
 */
const client = new DynamoDBClient({
  region: config.dynamodb.region,
  ...(config.dynamodb.endpoint && { endpoint: config.dynamodb.endpoint }),
});

/**
 * DynamoDB Document Client with automatic marshalling
 * removeUndefinedValues prevents errors when optional fields are undefined
 */
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Generate cryptographically secure API key with prefix
 * Uses crypto.randomBytes(32) for 256-bit entropy
 */
function generateKey(): string {
  const bytes = crypto.randomBytes(32);
  return `${API_KEY_PREFIX}${bytes.toString('base64url')}`;
}

/**
 * Hash API key with SHA-256 for storage
 * Never store plaintext keys
 */
function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Creates a new API key for a user.
 *
 * Uses single-table design with:
 * - pk: KEY#<uuid>
 * - sk: META
 * - GSI2: gsi2pk=USER#<sub>, gsi2sk=KEY#<created_at> (for listing user's keys)
 * - GSI3: gsi3pk=HASH#<sha256>, gsi3sk=KEY (for validation lookup)
 *
 * @param user - User object with sub and email
 * @param name - User-provided name for the key
 * @returns CreateKeyResult with full key (shown once only)
 */
export async function createApiKey(
  user: { sub: string; email: string },
  name: string
): Promise<CreateKeyResult> {
  const key = generateKey();
  const keyHash = hashKey(key);
  const keyId = uuidv4();
  const keyPrefix = key.substring(0, 12); // nll_ + 8 random chars
  const createdAt = new Date().toISOString();

  const item: ApiKeyItem = {
    pk: `KEY#${keyId}`,
    sk: 'META',
    gsi2pk: `USER#${user.sub}`,
    gsi2sk: `KEY#${createdAt}`,
    gsi3pk: `HASH#${keyHash}`,
    gsi3sk: 'KEY',
    key_id: keyId,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name,
    user_sub: user.sub,
    user_email: user.email,
    created_at: createdAt,
  };

  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(pk)',
    })
  );

  return {
    key,
    key_id: keyId,
    name,
    key_prefix: keyPrefix,
    created_at: createdAt,
  };
}

/**
 * Lists all active (non-revoked) API keys for a user.
 *
 * Queries GSI2 with:
 * - gsi2pk: USER#<sub>
 * - ScanIndexForward: false (newest first)
 *
 * @param userSub - User's Google sub identifier
 * @returns Array of ApiKey objects (no sensitive data)
 */
export async function listApiKeys(userSub: string): Promise<ApiKey[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.tableName,
      IndexName: 'GSI2',
      KeyConditionExpression: 'gsi2pk = :userKey',
      FilterExpression: 'attribute_not_exists(revoked_at)',
      ExpressionAttributeValues: {
        ':userKey': `USER#${userSub}`,
      },
      ScanIndexForward: false, // Newest first
    })
  );

  const items = (result.Items || []) as ApiKeyItem[];

  return items.map((item) => ({
    key_id: item.key_id,
    name: item.name,
    key_prefix: item.key_prefix,
    created_at: item.created_at,
    revoked_at: item.revoked_at,
  }));
}

/**
 * Revokes an API key by setting revoked_at timestamp.
 *
 * Conditions:
 * - Key must belong to the user (user_sub matches)
 * - Key must not already be revoked
 *
 * @param keyId - UUID of the key to revoke
 * @param userSub - User's Google sub (for ownership verification)
 * @returns true if revoked successfully, false if not found/wrong user/already revoked
 */
export async function revokeApiKey(keyId: string, userSub: string): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: config.dynamodb.tableName,
        Key: {
          pk: `KEY#${keyId}`,
          sk: 'META',
        },
        UpdateExpression: 'SET revoked_at = :now',
        ConditionExpression: 'user_sub = :userSub AND attribute_not_exists(revoked_at)',
        ExpressionAttributeValues: {
          ':now': new Date().toISOString(),
          ':userSub': userSub,
        },
      })
    );
    return true;
  } catch (error: any) {
    // ConditionalCheckFailedException means key not found, wrong user, or already revoked
    if (error.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
}

/**
 * Validates an API key by hashing and looking it up in DynamoDB.
 *
 * Queries GSI3 with:
 * - gsi3pk: HASH#<sha256_hash>
 * - gsi3sk: KEY
 *
 * Checks that revoked_at is undefined.
 *
 * @param providedKey - Full API key provided in request
 * @returns ValidateKeyResult with valid flag and user info if valid
 */
export async function validateApiKey(providedKey: string): Promise<ValidateKeyResult> {
  const keyHash = hashKey(providedKey);

  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.tableName,
      IndexName: 'GSI3',
      KeyConditionExpression: 'gsi3pk = :hashKey AND gsi3sk = :sortKey',
      ExpressionAttributeValues: {
        ':hashKey': `HASH#${keyHash}`,
        ':sortKey': 'KEY',
      },
    })
  );

  const items = (result.Items || []) as ApiKeyItem[];

  if (items.length === 0) {
    return { valid: false };
  }

  const item = items[0];

  // Check if key is revoked
  if (item.revoked_at) {
    return { valid: false };
  }

  return {
    valid: true,
    key_id: item.key_id,
    key_name: item.name,
    user_email: item.user_email,
    user_sub: item.user_sub,
  };
}

/**
 * API Key service class for dependency injection patterns
 */
export class ApiKeyService {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(region: string, tableName: string, endpoint?: string) {
    const client = new DynamoDBClient({
      region,
      ...(endpoint && { endpoint }),
    });
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.tableName = tableName;
  }

  private generateKey(): string {
    const bytes = crypto.randomBytes(32);
    return `${API_KEY_PREFIX}${bytes.toString('base64url')}`;
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  async createApiKey(user: { sub: string; email: string }, name: string): Promise<CreateKeyResult> {
    const key = this.generateKey();
    const keyHash = this.hashKey(key);
    const keyId = uuidv4();
    const keyPrefix = key.substring(0, 12);
    const createdAt = new Date().toISOString();

    const item: ApiKeyItem = {
      pk: `KEY#${keyId}`,
      sk: 'META',
      gsi2pk: `USER#${user.sub}`,
      gsi2sk: `KEY#${createdAt}`,
      gsi3pk: `HASH#${keyHash}`,
      gsi3sk: 'KEY',
      key_id: keyId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      user_sub: user.sub,
      user_email: user.email,
      created_at: createdAt,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );

    return {
      key,
      key_id: keyId,
      name,
      key_prefix: keyPrefix,
      created_at: createdAt,
    };
  }

  async listApiKeys(userSub: string): Promise<ApiKey[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'gsi2pk = :userKey',
        FilterExpression: 'attribute_not_exists(revoked_at)',
        ExpressionAttributeValues: {
          ':userKey': `USER#${userSub}`,
        },
        ScanIndexForward: false,
      })
    );

    const items = (result.Items || []) as ApiKeyItem[];

    return items.map((item) => ({
      key_id: item.key_id,
      name: item.name,
      key_prefix: item.key_prefix,
      created_at: item.created_at,
      revoked_at: item.revoked_at,
    }));
  }

  async revokeApiKey(keyId: string, userSub: string): Promise<boolean> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            pk: `KEY#${keyId}`,
            sk: 'META',
          },
          UpdateExpression: 'SET revoked_at = :now',
          ConditionExpression: 'user_sub = :userSub AND attribute_not_exists(revoked_at)',
          ExpressionAttributeValues: {
            ':now': new Date().toISOString(),
            ':userSub': userSub,
          },
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw error;
    }
  }

  async validateApiKey(providedKey: string): Promise<ValidateKeyResult> {
    const keyHash = this.hashKey(providedKey);

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'gsi3pk = :hashKey AND gsi3sk = :sortKey',
        ExpressionAttributeValues: {
          ':hashKey': `HASH#${keyHash}`,
          ':sortKey': 'KEY',
        },
      })
    );

    const items = (result.Items || []) as ApiKeyItem[];

    if (items.length === 0) {
      return { valid: false };
    }

    const item = items[0];

    if (item.revoked_at) {
      return { valid: false };
    }

    return {
      valid: true,
      key_id: item.key_id,
      key_name: item.name,
      user_email: item.user_email,
      user_sub: item.user_sub,
    };
  }
}
