const Redis = require("redis");
// Add this temporarily to your cache.js file at the top
console.log("🔍 Environment Debug:");
console.log("REDIS_HOST:", process.env.REDIS_HOST);
console.log("REDIS_PORT:", process.env.REDIS_PORT);
console.log("BLOCKCHAIN_RPC_URL:", process.env.BLOCKCHAIN_RPC_URL);
console.log("NODE_ENV:", process.env.NODE_ENV);

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.initializeRedis();
  }

  async initializeRedis() {
    try {
      // ✅ Only connect if Redis configuration is provided
      if (process.env.REDIS_HOST || process.env.NODE_ENV === "production") {
        // ✅ Ensure we're using the correct Redis port
        const redisPort = process.env.REDIS_PORT || 6379;
        const redisHost = process.env.REDIS_HOST || "localhost";

        console.log(
          `🔗 Attempting Redis connection to ${redisHost}:${redisPort}`
        );

        this.client = Redis.createClient({
          socket: {
            // ✅ Updated syntax for newer Redis client
            host: redisHost,
            port: parseInt(redisPort), // ✅ Ensure it's a number
            connectTimeout: 5000,
            lazyConnect: true,
          },
          password: process.env.REDIS_PASSWORD,
        });

        this.client.on("error", (err) => {
          console.warn("⚠️  Redis connection failed:", err.message);
          this.isConnected = false;
        });

        this.client.on("connect", () => {
          console.log("✅ Redis connected successfully");
          this.isConnected = true;
        });

        this.client.on("ready", () => {
          console.log("✅ Redis client ready");
          this.isConnected = true;
        });

        // ✅ Try to connect with timeout
        try {
          await this.client.connect();
        } catch (error) {
          console.warn("⚠️  Redis not available, using in-memory fallback");
          console.warn("Error details:", error.message);
          this.client = null;
          this.isConnected = false;
        }
      } else {
        console.log("📝 Redis not configured, using in-memory cache");
      }
    } catch (error) {
      console.warn("⚠️  Redis initialization failed:", error.message);
      this.client = null;
      this.isConnected = false;
    }
  }

  async get(key) {
    try {
      if (this.isConnected && this.client) {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
      }
      return null; // ✅ Fallback to null if Redis unavailable
    } catch (error) {
      console.warn("Cache get error:", error.message);
      return null;
    }
  }

  async set(key, data, ttl = 300) {
    try {
      if (this.isConnected && this.client) {
        await this.client.setEx(key, ttl, JSON.stringify(data));
        return true;
      }
      return false; // ✅ Indicate cache miss
    } catch (error) {
      console.warn("Cache set error:", error.message);
      return false;
    }
  }

  async del(key) {
    try {
      if (this.isConnected && this.client) {
        await this.client.del(key);
      }
    } catch (error) {
      console.warn("Cache delete error:", error.message);
    }
  }

  async invalidateElection(electionId) {
    try {
      if (this.isConnected && this.client) {
        const pattern = `election:${electionId}:*`;
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      }
    } catch (error) {
      console.warn("Cache invalidation error:", error.message);
    }
  }

  // ✅ Health check method
  isHealthy() {
    return this.isConnected;
  }

  // ✅ Debug method
  getConnectionInfo() {
    return {
      isConnected: this.isConnected,
      hasClient: !!this.client,
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
    };
  }
}

module.exports = new CacheService();
