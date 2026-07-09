#!/usr/bin/env node
// (1) MCQ key-mapping check: confirm each legacy MCQ answer equals the option
//     text at the answer_index authored in the source JSON (blind cross-check).
// (2) Idempotency: count DB rows for every new slug -> must be exactly 1 each.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './_env.mjs';
const env = loadEnv();
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const { getPassageBySlug } = await import('../../lib/supabase.js');
const { createClient } = await import('@supabase/supabase-js');
const __dirname = dirname(fileURLToPath(import.meta.url));

function slugify(str){return(String(str||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'passage');}
function shortHash(input){let h=5381;const s=String(input);for(let i=0;i<s.length;i+=1)h=((h<<5)+h)^s.charCodeAt(i);return(h>>>0).toString(36).slice(0,6);}
const stableSlug=(skill,module,title)=>`${slugify(title)}-${shortHash(`${skill}:${module}:${title}`)}`;

const NEWFILES=['reading-batch2-nature.json','reading-batch2-culture.json','reading-batch2-society.json','reading-batch2-mind.json','reading-general.json','writing-batch2.json'];
const norm=(s)=>String(s).trim().toLowerCase().replace(/\s+/g,' ');

// ---- (1) MCQ blind cross-check on all NEW reading passages ----
let mcqTotal=0, mcqOk=0, mcqBad=0;
for (const f of NEWFILES) {
  const arr=JSON.parse(readFileSync(join(__dirname,'data',f),'utf8'));
  for (const item of arr) {
    if (item.skill!=='reading') continue;
    const module=item.module||'academic';
    const slug=stableSlug('reading',module,item.title);
    const p=await getPassageBySlug('reading',slug);
    if(!p){console.log('MISSING',slug);mcqBad++;continue;}
    // collect authored MCQ correct option TEXT in order
    const authoredMcq=[];
    for(const g of item.groups){ if(g.question_type==='multiple_choice'){ for(const q of g.questions){ authoredMcq.push(q.options[q.answer_index]); } } }
    // collect legacy MCQ answers (display text "X) text") in order
    const legacyMcq=[];
    for(const g of p.questionGroups){ if(g.questionType==='Match'){ for(const q of g.questions){ legacyMcq.push(q.answer); } } }
    if(authoredMcq.length!==legacyMcq.length){console.log(`COUNT MISMATCH ${item.title}: authored ${authoredMcq.length} vs legacy ${legacyMcq.length}`);mcqBad++;continue;}
    for(let i=0;i<authoredMcq.length;i++){ mcqTotal++;
      // legacy answer is "B) <text>"; strip the "X) " prefix
      const legacyText=legacyMcq[i].replace(/^[A-Z]\)\s*/,'');
      if(norm(legacyText)===norm(authoredMcq[i])) mcqOk++; else {mcqBad++; console.log(`MCQ MISMATCH ${item.title} #${i}: legacy="${legacyText}" authored="${authoredMcq[i]}"`);}
    }
  }
}
console.log(`MCQ key-mapping: ${mcqOk}/${mcqTotal} correct, bad=${mcqBad}`);

// ---- (2) Idempotency: every new slug appears exactly once ----
const sb=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const newSlugs=[];
for(const f of NEWFILES){const arr=JSON.parse(readFileSync(join(__dirname,'data',f),'utf8'));for(const item of arr){const module=item.module||'academic';newSlugs.push(stableSlug(item.skill,module,item.title));}}
let dupes=0, missing=0;
for(const slug of newSlugs){
  const {data,error}=await sb.from('passages').select('id',{count:'exact'}).eq('slug',slug);
  if(error){console.log('ERR',slug,error.message);continue;}
  if(data.length===0){missing++;console.log('MISSING ROW',slug);}
  else if(data.length>1){dupes++;console.log('DUPLICATE ROW',slug,data.length);}
}
console.log(`Idempotency: ${newSlugs.length} new slugs, missing=${missing}, duplicated=${dupes}`);

// ---- published counts by skill/module ----
for(const [skill,module] of [['reading','academic'],['reading','general'],['writing','academic'],['writing','general']]){
  const {count}=await sb.from('passages').select('*',{count:'exact',head:true}).eq('skill',skill).eq('module',module).eq('status','published');
  console.log(`published ${skill}/${module}: ${count}`);
}
console.log(`\nOverall: ${(mcqBad===0&&dupes===0&&missing===0)?'PASS':'FAIL'}`);
