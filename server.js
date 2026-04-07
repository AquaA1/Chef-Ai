require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MongoDB connection ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("\n❌ MONGODB_URI is not set in .env\n");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log(" ✅ MongoDB: Connected Successfully"))
  .catch(err => { 
    console.error(" ❌ MongoDB connection failed:", err.message); 
    console.log("👉 Check your password in the .env file!");
    process.exit(1); 
  });

// ─── Mongoose schema ─────────────────────────────────────────────────────────
const historyEntrySchema = new mongoose.Schema({
  id: { type: String, required: true },
  ingredients: { type: String, required: true },
  recipes: { type: mongoose.Schema.Types.Mixed, default: [] },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
  _id: { type: String }, // Username style ID
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  history: { type: [historyEntrySchema], default: [] },
});

const User = mongoose.model("User", userSchema);

// ─── ID generation ───────────────────────────────────────────────────────────
const adjectives = ["vanilla","spicy","crispy","golden","smoky","tangy","sweet","savory","zesty","buttery"];
const nouns = ["mango","butter","garlic","pepper","basil","ginger","lemon","thyme","saffron","truffle"];

async function generateUserId() {
  let id, tries = 0;
  do {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    id = `${adj}_${noun}`;
    tries++;
    const taken = await User.exists({ _id: id });
    if (!taken) break;
  } while (tries < 100);
  return id;
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── POST /auth ───────────────────────────────────────────────────────────────
app.post("/auth", async (req, res) => {
  const { password } = req.body;
  if (!password || password.trim().length < 4)
    return res.status(400).json({ success: false, message: "Password too short." });

  try {
    const existing = await User.findOne({ password });
    if (existing) return res.json({ success: true, userId: existing._id, isNew: false });

    const userId = await generateUserId();
    await User.create({ _id: userId, password });
    return res.json({ success: true, userId, isNew: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ─── GET /history/:userId ─────────────────────────────────────────────────────
app.get("/history/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ history: user.history || [] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /generate ───────────────────────────────────────────────────────────
app.post("/generate", async (req, res) => {
  const { ingredients, userId } = req.body;
  if (!ingredients || ingredients.trim() === "")
    return res.status(400).json({ error: "Please provide ingredients." });

  try {
    const result = await generateRecipes(ingredients);

    if (userId && result.recipes && result.recipes.length > 0) {
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ingredients: ingredients.trim(),
        recipes: result.recipes,
        timestamp: new Date(),
      };
      await User.updateOne(
        { _id: userId },
        { $push: { history: { $each: [entry], $position: 0, $slice: 50 } } }
      );
      result.entryId = entry.id;
    }

    res.json(result);
  } catch (err) {
    console.error("/generate error:", err);
    res.status(500).json({ error: "Failed to generate recipes." });
  }
});

// ─── Gemini Recipe Generator ─────────────────────────────────────────────────
async function generateRecipes(ingredients) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `
    You are a professional chef. Based on these ingredients: ${ingredients}, 
    generate 3 creative recipes. 
    Return the data strictly as a JSON object with a key "recipes" which is an array of objects.
    Each object must have:
    - name (string)
    - emoji (string)
    - ingredients (array of strings)
    - steps (array of strings)
    - time (string)
    - difficulty (string)
    - score (number, 1-100 based on ingredient match)
    - missing (array of strings)
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const data = JSON.parse(response.text());
    
    // Auto-generate YouTube links for each recipe
    data.recipes = data.recipes.map(r => ({
      ...r,
      youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(r.name + " recipe")}`
    }));

    return data;
  } catch (error) {
    console.error("Gemative AI Error:", error);
    return { recipes: [], noMatch: true };
  }
}

// ─── Delete Handlers ─────────────────────────────────────────────────────────
app.delete("/history/:userId/:entryId", async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.params.userId },
      { $pull: { history: { id: req.params.entryId } } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/history/:userId", async (req, res) => {
  try {
    await User.updateOne({ _id: req.params.userId }, { $set: { history: [] } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🍳 ChefAI Active → http://localhost:${PORT}\n`);
});