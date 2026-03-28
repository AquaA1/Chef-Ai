require('dotenv').config();
const express = require("express");
const path = require("path");
const fs = require("fs");
// Import Gemini SDK
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Update Env Variable name for clarity (optional, but good practice)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const app = express();
const PORT = 3000;
const DB = path.join(__dirname, "users.json");

function readDB() {
  if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({}));
  try { return JSON.parse(fs.readFileSync(DB, "utf8")); }
  catch { return {}; }
}
function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

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

function generateUserId(existing) {
  let id, tries = 0;
  do {
    const adj  = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    id = `${adj}_${noun}`;
    tries++;
  } while (existing[id] && tries < 100);
  return id;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// POST /auth — register (new password) or login (existing password)
app.post("/auth", (req, res) => {
  const { password } = req.body;
  if (!password || password.trim().length < 4)
    return res.status(400).json({ success: false, message: "Password must be at least 4 characters." });

  const db = readDB();
  const existing = Object.values(db).find(u => u.password === password);
  if (existing)
    return res.json({ success: true, userId: existing.id, isNew: false });

  const userId = generateUserId(db);
  db[userId] = { id: userId, password, createdAt: new Date().toISOString(), history: [] };
  writeDB(db);
  return res.json({ success: true, userId, isNew: true });
});

// GET /history/:userId
app.get("/history/:userId", (req, res) => {
  const db = readDB();
  const user = db[req.params.userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ history: user.history || [] });
});

// DELETE /history/:userId/:entryId — remove one entry
app.delete("/history/:userId/:entryId", (req, res) => {
  const db = readDB();
  const user = db[req.params.userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  user.history = (user.history || []).filter(h => h.id !== req.params.entryId);
  writeDB(db);
  res.json({ success: true });
});

// DELETE /history/:userId — clear all history
app.delete("/history/:userId", (req, res) => {
  const db = readDB();
  const user = db[req.params.userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  user.history = [];
  writeDB(db);
  res.json({ success: true });
});

// POST /generate
app.post("/generate", async (req, res) => {
  const { ingredients, userId } = req.body;
  if (!ingredients || ingredients.trim() === "")
    return res.status(400).json({ error: "Please provide ingredients." });

  try {
    const result = await generateRecipes(ingredients);
    if (userId) {
      const db = readDB();
      const user = db[userId];
      if (user) {
        const entry = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
          ingredients: ingredients.trim(),
          recipes: result.recipes,
          timestamp: new Date().toISOString()
        };
        user.history = [entry, ...(user.history || [])].slice(0, 50);
        writeDB(db);
        result.entryId = entry.id;
      }
    }
    res.json(result);
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: "Failed to generate recipes." });
  }
});



// ─── Recipe matching engine ────────────────────────

const RECIPES_PATH = path.join(__dirname, "recipes.json");
let RECIPE_DB = [];
try {
  RECIPE_DB = JSON.parse(fs.readFileSync(RECIPES_PATH, "utf8"));
  console.log(`   Recipe DB: ${RECIPE_DB.length} recipes loaded from recipes.json`);
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
  leeks:"leek", prawns:"shrimp", salmons:"salmon",
};

function normalizeIngredient(raw) {
  const s = raw.toLowerCase().trim().replace(/\s+/g, " ");
  return NORMALIZE_MAP[s] || s;
}

function parseIngredients(raw) {
  return raw.split(/[,;\n]+/)
    .map(s => normalizeIngredient(s))
    .filter(Boolean);
}

const BASE_INGREDIENTS = new Set([
  "salt","pepper","oil","olive oil","water","sugar","flour"
]);

function matchRecipes(userIngredients) {
  const userSet = new Set(userIngredients);

  const scored = RECIPE_DB.map(recipe => {
    const recipeIngs = recipe.ingredients.map(normalizeIngredient);
    const meaningful = recipeIngs.filter(i => !BASE_INGREDIENTS.has(i));
    if (!meaningful.length) return null;

    let matchCount = 0;
    const missing  = [];
    for (const ing of meaningful) {
      const matched = userSet.has(ing) ||
        [...userSet].some(u => ing.includes(u) || u.includes(ing));
      if (matched) matchCount++;
      else missing.push(ing);
    }

    const score = Math.round((matchCount / meaningful.length) * 100);
    const ytQuery = encodeURIComponent(recipe.name + " recipe");

    return {
      name:        recipe.name,
      emoji:       recipe.emoji || "🍽️",
      ingredients: recipe.ingredients,
      steps:       recipe.steps,
      time:        recipe.time   || "—",
      difficulty:  recipe.difficulty || "—",
      score,
      missing,
      youtube: `https://www.youtube.com/results?search_query=${ytQuery}`,
    };
  })
  .filter(r => r && r.score > 0)
  .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3);
}

// Replaced OpenAI logic with Gemini logic
async function generateRecipes(ingredients) {
  const userIngredients = parseIngredients(ingredients);
  let recipes = matchRecipes(userIngredients);

  // If we have an API key and a mismatch/empty result, we can use Gemini to "hallucinate" or improve suggestions
  // However, per your original code structure, we use the local matching engine first.
  
  if (!recipes.length) {
    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            // const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `I have these ingredients: ${ingredients}. Suggest 3 creative recipes. 
            Return ONLY a JSON array of objects with keys: name, emoji, ingredients (array), steps (array), time, difficulty. 
            Do not include Markdown formatting or "json" tags.`;
            
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            // Simple cleanup if model adds ```json ... ``` blocks
            const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
            const aiRecipes = JSON.parse(cleanJson);
            
            recipes = aiRecipes.map(r => ({
                ...r,
                score: 100, // AI generated is considered a "perfect" creative match
                missing: [],
                youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(r.name + " recipe")}`
            }));
        } catch (e) {
            console.error("Gemini AI error:", e);
            return { recipes: [], noMatch: true };
        }
    } else {
        return { recipes: [], noMatch: true };
    }
  }

  return { recipes };
}

app.listen(PORT, () => {
  console.log(`\n🍳 Mise en Place running → http://localhost:${PORT}`);
  console.log(`   AI mode: ${GEMINI_API_KEY ? "Google Gemini" : "Mock (set GEMINI_API_KEY for real AI)"}`);
  console.log(`   User data: ${DB}\n`);
});