export const ConfigSchema: any =  {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "title": "ClickHouse Conversation Plugin Configuration",
    "description": "Configuration schema for the TracerPlugin that stores conversation data in ClickHouse",
    "required": ["clickhouse"],
    "properties": {
        "clickhouse": {
            "type": "object",
            "title": "ClickHouse Connection Configuration",
            "description": "ClickHouse database connection settings",
            "required": ["host"],
            "properties": {
                "host": {
                    "type": "string",
                    "title": "ClickHouse Host",
                    "description": "The hostname or IP address of the ClickHouse server",
                    "examples": ["localhost", "clickhouse.example.com", "192.168.1.100"]
                },
                "port": {
                    "type": "integer",
                    "title": "ClickHouse Port",
                    "description": "The port number for ClickHouse HTTP interface",
                    "default": 8123,
                    "minimum": 1,
                    "maximum": 65535
                },
                "username": {
                    "type": "string",
                    "title": "Username",
                    "description": "Username for ClickHouse authentication (optional)"
                },
                "password": {
                    "type": "string",
                    "title": "Password",
                    "description": "Password for ClickHouse authentication (optional)",
                    "format": "password"
                },
                "database": {
                    "type": "string",
                    "title": "Database Name",
                    "description": "The name of the ClickHouse database to use",
                    "default": "default",
                    "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$"
                },
                "protocol": {
                    "type": "string",
                    "title": "Protocol",
                    "description": "Protocol to use for ClickHouse connection",
                    "enum": ["http", "https"],
                    "default": "http"
                },
                "debug": {
                    "type": "boolean",
                    "title": "Debug Mode",
                    "description": "Enable debug logging for ClickHouse client",
                    "default": false
                }
            },
            "additionalProperties": false
        },
        "tableName": {
            "type": "string",
            "title": "Table Name",
            "description": "Name of the ClickHouse table to store conversation data",
            "default": "conversations",
            "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$",
            "minLength": 1,
            "maxLength": 128
        },
        "flushInterval": {
            "type": "integer",
            "title": "Flush Interval",
            "description": "Interval in milliseconds to flush pending records to ClickHouse",
            "default": 10000,
            "minimum": 1000,
            "maximum": 300000
        }
    },
    "additionalProperties": false
}
