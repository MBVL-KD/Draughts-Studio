import mongoose from "mongoose";

export async function connectMongo(uri: string) {
  if (!uri) {
    throw new Error("MONGO_URI missing");
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}

export function mongoHealth() {
  return {
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}
