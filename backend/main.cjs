const { MongoClient } = require('mongodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { createResourceApi } = require('./resource-api.cjs')

async function main() {
  const { MONGODB_URI, R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
    RESOURCE_READ_TOKEN, RESOURCE_ADMIN_TOKEN } = process.env
  if (![MONGODB_URI, R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY].every(Boolean) ||
      !/^[a-f0-9]{32}$/.test(R2_ACCOUNT_ID)) {
    throw new Error('Set MongoDB and Cloudflare R2 credentials in the backend environment.')
  }
  const database = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000, timeoutMS: 10000 })
  const collection = database.db(process.env.MONGODB_DATABASE || 'lone_x').collection('resources')
  const storage = new S3Client({
    region: 'auto', endpoint: 'https://' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
  })
  const server = createResourceApi({
    readToken: RESOURCE_READ_TOKEN, adminToken: RESOURCE_ADMIN_TOKEN,
    registry: {
      list: () => collection.find({ withdrawnAt: null }).sort({ createdAt: -1, _id: 1 }).limit(100).toArray(),
      get: (id, version) => collection.findOne({ _id: id + ':' + version }),
      withdraw: (id, version, at) => collection.findOneAndUpdate(
        { _id: id + ':' + version },
        [{ $set: { withdrawnAt: { $ifNull: ['$withdrawnAt', at] } } }],
        { returnDocument: 'after' }
      ),
      async insert(record) {
        try {
          await collection.insertOne({ _id: record.id + ':' + record.version, ...record })
          return true
        } catch (error) {
          if (error.code === 11000) return false
          throw error
        }
      }
    },
    objects: {
      async get(key, etag, signal) {
        try {
          const result = await storage.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, IfMatch: etag }), { abortSignal: signal })
          return { body: result.Body, size: result.ContentLength, etag: result.ETag }
        } catch (error) {
          if ([404, 412].includes(error.$metadata?.httpStatusCode)) return null
          throw error
        }
      }
    }
  })
  try {
    await database.connect()
    await collection.createIndex({ withdrawnAt: 1, createdAt: -1, _id: 1 })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', resolve)
    })
  } catch {
    storage.destroy()
    await database.close()
    throw new Error('Could not initialize the resource API. Check service configuration and connectivity.')
  }
  const close = () => server.close(async () => {
    storage.destroy()
    await database.close()
  })
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
  console.log('Lone X resource API is listening.')
}

main().catch(() => {
  console.error('Could not start the resource API. Check the required environment variables, service connectivity, and listener address.')
  process.exitCode = 1
})
