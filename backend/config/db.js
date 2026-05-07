import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

let connection = null;

export async function connectDB() {
  if (connection) return connection;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to backend/.env (local) or to your Render environment.'
    );
  }

  try {
    connection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 10
    });
    const { host, name } = mongoose.connection;
    console.log(`MongoDB connected: ${host}/${name}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }

  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (e) => console.error('MongoDB error:', e.message));

  return connection;
}
