import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config/index.js';
import type { User, GoogleUserInfo } from '../types/index.js';

/**
 * DynamoDB client configured with region from config
 */
const client = new DynamoDBClient({ region: config.dynamodb.region });

/**
 * DynamoDB Document Client with automatic marshalling
 * removeUndefinedValues prevents errors when optional fields are undefined
 */
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Retrieves a user by their Google sub (unique identifier).
 *
 * Uses single-table design with:
 * - pk: USER#<google_sub>
 * - sk: PROFILE
 *
 * @param sub - Google's unique user identifier
 * @returns User record or null if not found
 */
export async function getUserBySub(sub: string): Promise<User | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.dynamodb.tableName,
      Key: {
        pk: `USER#${sub}`,
        sk: 'PROFILE',
      },
    })
  );

  return (result.Item as User) || null;
}

/**
 * Creates or updates a user record after OAuth authentication.
 *
 * - New users: Creates full record with timestamps
 * - Existing users: Updates last_login timestamp only
 *
 * Uses single-table design with:
 * - pk: USER#<google_sub>
 * - sk: PROFILE
 * - GSI1: gsi1pk=EMAIL#<email>, gsi1sk=USER (for email lookups)
 *
 * @param googleUser - User info from verified Google token
 * @returns The user record (created or updated)
 */
export async function upsertUser(googleUser: GoogleUserInfo): Promise<User> {
  const now = new Date().toISOString();
  const pk = `USER#${googleUser.sub}`;

  // Check if user exists
  const existing = await getUserBySub(googleUser.sub);

  if (existing) {
    // Update last_login for existing user
    await docClient.send(
      new UpdateCommand({
        TableName: config.dynamodb.tableName,
        Key: {
          pk,
          sk: 'PROFILE',
        },
        UpdateExpression: 'SET last_login = :now',
        ExpressionAttributeValues: {
          ':now': now,
        },
      })
    );

    // Return existing user with updated last_login
    return {
      ...existing,
      last_login: now,
    };
  }

  // Create new user
  const user: User = {
    pk,
    sk: 'PROFILE',
    gsi1pk: `EMAIL#${googleUser.email}`,
    gsi1sk: 'USER',
    google_sub: googleUser.sub,
    email: googleUser.email,
    name: googleUser.name,
    created_at: now,
    last_login: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.tableName,
      Item: user,
    })
  );

  return user;
}

/**
 * User service class for dependency injection patterns
 */
export class UserService {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(region: string, tableName: string) {
    const client = new DynamoDBClient({ region });
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.tableName = tableName;
  }

  async getUserBySub(sub: string): Promise<User | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: `USER#${sub}`,
          sk: 'PROFILE',
        },
      })
    );

    return (result.Item as User) || null;
  }

  async upsertUser(googleUser: GoogleUserInfo): Promise<User> {
    const now = new Date().toISOString();
    const pk = `USER#${googleUser.sub}`;

    const existing = await this.getUserBySub(googleUser.sub);

    if (existing) {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            pk,
            sk: 'PROFILE',
          },
          UpdateExpression: 'SET last_login = :now',
          ExpressionAttributeValues: {
            ':now': now,
          },
        })
      );

      return {
        ...existing,
        last_login: now,
      };
    }

    const user: User = {
      pk,
      sk: 'PROFILE',
      gsi1pk: `EMAIL#${googleUser.email}`,
      gsi1sk: 'USER',
      google_sub: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name,
      created_at: now,
      last_login: now,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: user,
      })
    );

    return user;
  }
}
