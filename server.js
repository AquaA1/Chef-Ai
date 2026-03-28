require("dotenv").config();

const express  = require("express");
const path     = require("path");
const fs       = require("fs");
const mongoose = require("mongoose");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MongoDB connection ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("\n❌  MONGODB_URI is not set. Create a .env file with your Atlas connection string.\n");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log("   MongoDB: connected ✓"))
  .catch(err => { console.error("   MongoDB connection failed:", err.message); process.exit(1); });

// ─── Mongoose schema ─────────────────────────────────────────────────────────
const historyEntrySchema = new mongoose.Schema({
  id:          { type: String, required: true },
  ingredients: { type: String, required: true },
  recipes:     { type: mongoose.Schema.Types.Mixed, default: [] },
  timestamp:   { type: Date,   default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
  _id:       { type: String },   // "spicy_mango" style id IS the _id
  password:  { type: String, required: true },
  createdAt: { type: Date,   default: Date.now },
  history:   { type: [historyEntrySchema], default: [] },
});

const User = mongoose.model("User", userSchema);

// ─── ID generation ───────────────────────────────────────────────────────────
const adjectives = [
  "vanilla","spicy","crispy","golden","smoky","tangy","sweet",
  "savory","zesty","buttery","herby","silky","bold","fresh",
  "rustic","umami","citrus","velvet","maple","chili","toasty",
  "briny","earthy","floral","peppy","salty","wild","saucy"
];
const nouns = [
  "mango","butter","garlic","pepper","basil","ginger","lemon",
  "thyme","cumin","saffron","truffle","paprika","fennel","tahini",
  "miso","cardamom","tarragon","sumac","harissa","yuzu","clove",
  "nutmeg","anise","caper","brine","dill","sage","chive"
];

async function generateUserId() {
  let id, tries = 0;
  do {
    const adj  = adjectives[Math.floor(Math.random() * adjectives.length)];
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
    return res.status(400).json({ success: false, message: "Password must be at least 4 characters." });

  try {
    const existing = await User.findOne({ password });
    if (existing)
      return res.json({ success: true, userId: existing._id, isNew: false });

    const userId = await generateUserId();
    await User.create({ _id: userId, password });
    return res.json({ success: true, userId, isNew: true });
  } catch (err) {
    console.error("/auth error:", err);
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

// ─── DELETE /history/:userId/:entryId ────────────────────────────────────────
app.delete("/history/:userId/:entryId", async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.params.userId },
      { $pull: { history: { id: req.params.entryId } } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── DELETE /history/:userId (clear all) ─────────────────────────────────────
app.delete("/history/:userId", async (req, res) => {
  try {
    await User.updateOne({ _id: req.params.userId }, { $set: { history: [] } });
    res.json({ success: true });
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

    if (userId) {
      const entry = {
        id:          Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ingredients: ingredients.trim(),
        recipes:     result.recipes,
        timestamp:   new Date(),
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

// ─── Recipe matching engine ───────────────────────────────────────────────────
const RECIPES_PATH = path.join(__dirname, "recipes.json");
let RECIPE_DB = [];
try {
  RECIPE_DB = JSON.parse(fs.readFileSync(RECIPES_PATH, "utf8"));
  console.log(`   Recipe DB: ${RECIPE_DB.length} recipes loaded`);
} catch (e) {
  console.error("   Could not load recipes.json:", e.message);
}

const NORMALIZE_MAP = {
  tomatoes:"tomato", potatoes:"potato", onions:"onion", carrots:"carrot",
  mushrooms:"mushroom", lemons:"lemon", limes:"lime", apples:"apple",
  bananas:"banana", mangoes:"mango", mangos:"mango", eggs:"egg",
  chickens:"chicken", shrimps:"shrimp", prawns:"shrimp", prawn:"shrimp",
  noodles:"noodle", beans:"bean", peppers:"pepper", chilies:"chili",
  chillis:"chili", chillies:"chili", herbs:"herb", cloves:"clove",
  cheeses:"cheese", butters:"butter", flours:"flour", oats:"oat",
  "spring onions":"spring onion", "coconut milk":"coconut milk",
  "soy sauce":"soy sauce", "olive oil":"olive oil",
  "taco shells":"taco shell", croutons:"crouton", olives:"olive",
  leeks:"leek", salmons:"salmon",
};

function normalizeIngredient(raw) {
  const s = raw.toLowerCase().trim().replace(/\s+/g, " ");
  return NORMALIZE_MAP[s] || s;
}

function parseIngredients(raw) {
  return raw.split(/[,;\n]+/).map(s => normalizeIngredient(s)).filter(Boolean);
}

const BASE_INGREDIENTS = new Set(["salt","pepper","oil","olive oil","water","sugar","flour"]);

function matchRecipes(userIngredients) {
  const userSet = new Set(userIngredients);
  const scored = RECIPE_DB.map(recipe => {
    const recipeIngs = recipe.ingredients.map(normalizeIngredient);
    const meaningful = recipeIngs.filter(i => !BASE_INGREDIENTS.has(i));
    if (!meaningful.length) return null;

    let matchCount = 0;
    const missing = [];
    for (const ing of meaningful) {
      const matched = userSet.has(ing) ||
        [...userSet].some(u => ing.includes(u) || u.includes(ing));
      if (matched) matchCount++;
      else missing.push(ing);
    }

    const score   = Math.round((matchCount / meaningful.length) * 100);
    const ytQuery = encodeURIComponent(recipe.name + " recipe");
    return {
      name: recipe.name, emoji: recipe.emoji || "🍽️",
      ingredients: recipe.ingredients, steps: recipe.steps,
      time: recipe.time || "—", difficulty: recipe.difficulty || "—",
      score, missing,
      youtube: `https://www.youtube.com/results?search_query=${ytQuery}`,
    };
  })
  .filter(r => r && r.score > 0)
  .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3);
}

async function generateRecipes(ingredients) {
  const recipes = matchRecipes(parseIngredients(ingredients));
  if (!recipes.length) return { recipes: [], noMatch: true };
  return { recipes };
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🍳 Mise en Place → http://localhost:${PORT}\n`);
});