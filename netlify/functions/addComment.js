// netlify/functions/addComment.js

import { MongoClient } from "mongodb";

// Simple bad words list
const BAD_WORDS = ["badword1", "badword2", "curseword"]; // expand as needed

// Rate limiting: store last submission timestamps in memory
// Since Netlify functions are stateless across cold starts, this is basic
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 30 * 1000; // 30 seconds per IP

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ip =
    event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"] || "unknown";

  const now = Date.now();
  const lastTime = rateLimitMap.get(ip) || 0;
  if (now - lastTime < RATE_LIMIT_MS) {
    return { statusCode: 429, body: "Slow down! You are sending messages too quickly." };
  }

  rateLimitMap.set(ip, now);

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { name, message } = data;
  if (!name || !message) {
    return { statusCode: 400, body: "Name and message are required" };
  }

  // Simple bad word filter
  const lowered = message.toLowerCase();
  for (const word of BAD_WORDS) {
    if (lowered.includes(word)) {
      return { statusCode: 400, body: "Your message contains inappropriate words." };
    }
  }

  // MongoDB connection
  const uri = process.env.MONGO_URI;
  if (!uri) return { statusCode: 500, body: "Database connection not configured." };

  let client;
  try {
    client = new MongoClient(uri);
    await client.connect();
    const db = client.db("birthday"); // optional: change name
    const collection = db.collection("comments");

    const result = await collection.insertOne({
      name,
      message,
      createdAt: new Date(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: result.insertedId }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Database error" };
  } finally {
    if (client) await client.close();
  }
}
