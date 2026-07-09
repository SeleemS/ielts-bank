import { app } from '../src/firebase';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

// Section -> Firestore collection name.
export const COLLECTIONS = {
  reading: 'readingPassages',
  writing: 'writingPassages',
  listening: 'listeningPassages',
};

// Strip HTML tags and collapse whitespace, then truncate for meta descriptions.
export function toMetaDescription(html, max = 150) {
  if (!html) return '';
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trim() + '...';
}

// Deeply strip undefined values so Firestore data is JSON-serializable for props.
export function serialize(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

// Enumerate all document IDs in a collection (used by getStaticPaths).
export async function getPassageIds(collectionName) {
  const db = getFirestore(app);
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((d) => d.id);
}

// Fetch a single passage doc; returns null when it does not exist.
export async function getPassage(collectionName, id) {
  const db = getFirestore(app);
  const snapshot = await getDoc(doc(db, collectionName, id));
  if (!snapshot.exists()) return null;
  return serialize(snapshot.data());
}

// List documents in a collection with a small, serializable projection
// (used by the section landing pages).
export async function listPassages(collectionName) {
  const db = getFirestore(app);
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((d) => {
    const data = d.data();
    return serialize({
      id: d.id,
      title: data.passageTitle || 'Untitled',
      difficulty: data.passageDifficulty || null,
    });
  });
}
