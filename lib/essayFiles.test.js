import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseEssay } from './essayParser';

// Validates every content/essays/*.md file INDEPENDENTLY. lib/essays.js throws
// on the first invalid file (so a broken essay fails the build loudly); this
// suite reports each file's problem on its own line, which is what an author
// fixing several essays at once needs.
const DIR = path.join(process.cwd(), 'content', 'essays');
const files = fs.readdirSync(DIR).filter((file) => file.endsWith('.md')).sort();

describe('content/essays files', () => {
  it.each(files)('%s is a valid essay', (file) => {
    const essay = parseEssay(file, fs.readFileSync(path.join(DIR, file), 'utf8'));
    expect(essay.slug).toBe(file.replace(/\.md$/, ''));
  });
});
