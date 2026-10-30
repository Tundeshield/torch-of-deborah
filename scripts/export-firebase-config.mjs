// Writes firestore.rules and firestore.indexes.json from the single source in netlify/functions/_lib/firebase-config.js
import { writeFileSync } from "node:fs";
import { RULES, INDEXES } from "../netlify/functions/_lib/firebase-config.js";
writeFileSync("firestore.rules", RULES);
writeFileSync("firestore.indexes.json", JSON.stringify({ indexes: INDEXES.map((i) => ({ collectionGroup: i.collectionGroup, queryScope: "COLLECTION", fields: i.fields })), fieldOverrides: [] }, null, 2) + "\n");
console.log("Wrote firestore.rules and firestore.indexes.json");
