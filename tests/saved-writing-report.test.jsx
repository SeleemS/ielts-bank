// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user:{id:'owner'}, id:'10000000-0000-4000-8000-000000000001', push:vi.fn() }));
vi.mock('next/router',()=>({useRouter:()=>({query:{id:state.id},push:state.push})}));
vi.mock('next/head',()=>({default:()=>null}));
vi.mock('next/link',()=>({default:({children,...props})=><a {...props}>{children}</a>}));
vi.mock('../src/components/Navbar',()=>({default:()=>null}));
vi.mock('../src/components/Footer',()=>({default:()=>null}));
vi.mock('../src/components/auth/SignInDialog',()=>({default:()=>null}));
vi.mock('../src/components/question/WritingScoreReport',()=>({default:({result})=><p>{result.free?'Free diagnostic':result.summary}</p>}));
vi.mock('../src/lib/auth',()=>({useAuth:()=>({user:state.user,loading:false})}));
vi.mock('../src/lib/analytics',()=>({track:vi.fn()}));
vi.mock('../src/lib/writingReports',()=>({requestWritingReport:vi.fn()}));
import Page from '../pages/writing-report/[id]';
import { requestWritingReport } from '../src/lib/writingReports';
import { consumeWritingDraft } from '../src/lib/writingDraft';
let root,container;
const full = ()=>({reportId:state.id,taskType:'task1-general',prompt:'Write a letter',essay:'Own letter text',canUnlock:true,result:{task:1,free:false,summary:'Private full feedback'}});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{state.user={id:'owner'};state.push.mockClear();requestWritingReport.mockReset();window.sessionStorage.clear();container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(){await act(async()=>{root.render(<Page/>);});}
it('opens full saved feedback without scoring, and starts a non-submitting revision with its original task',async()=>{
  requestWritingReport.mockResolvedValueOnce({...full(),result:{task:1,free:true}}).mockResolvedValueOnce(full());
  await render();expect(requestWritingReport.mock.calls).toEqual([[state.id],[state.id,'POST']]);
  expect(container.textContent).toContain('Private full feedback');
  const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Revise this essay');
  act(()=>button.click());expect(state.push).toHaveBeenCalledWith('/ielts-writing-checker');
  expect(consumeWritingDraft()).toMatchObject({taskType:'task1-general',essay:'Own letter text',autoSubmit:false,revisionOf:state.id});
});
it('never tries to unlock a verified free account and clears feedback at sign-out',async()=>{
  requestWritingReport.mockResolvedValue({...full(),canUnlock:false,result:{task:1,free:true}});
  await render();expect(requestWritingReport).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('Free diagnostic');
  state.user=null;await render();expect(container.textContent).not.toContain('Free diagnostic');expect(container.textContent).toContain('Sign in with the account');
});
it('discards an earlier account response after switching accounts',async()=>{
  let resolve;requestWritingReport.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  await render();state.user={id:'other'};requestWritingReport.mockRejectedValueOnce(new Error('Report not found in this account.'));
  await render();await act(async()=>resolve(full()));
  expect(container.textContent).not.toContain('Private full feedback');expect(container.textContent).toContain('Report not found');
});
it('retains a retry when delivery recording fails instead of claiming full delivery',async()=>{
  requestWritingReport.mockResolvedValueOnce({...full(),result:{task:1,free:true}}).mockRejectedValueOnce(new Error('Try again later'));
  await render();expect(container.textContent).not.toContain('Private full feedback');expect(container.querySelector('[role="alert"]').textContent).toContain('Try again');
});
