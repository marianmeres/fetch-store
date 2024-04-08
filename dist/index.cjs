"use strict";const t=t=>"function"==typeof t,e=(e,r="")=>{if(!t(e))throw new TypeError(`${r} Expecting function arg`.trim())},r=e=>t(e.subscribe),s=(r,s=null)=>{const n=e=>t(s?.persist)&&s.persist(e);let c=(()=>{const t=new Map,e=e=>(t.has(e)||t.set(e,new Set),t.get(e)),r=(t,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return e(t).add(r),()=>e(t).delete(r)};return{publish:(t,r)=>{e(t).forEach((t=>t(r)))},subscribe:r,subscribeOnce:(t,e)=>{const s=r(t,(t=>{e(t),s()}));return s},unsubscribeAll:e=>t.delete(e)}})(),l=r;n(l);const a=()=>l,i=t=>{l!==t&&(l=t,n(l),c.publish("change",l))};return{set:i,get:a,update:t=>{e(t,"[update]"),i(t(a()))},subscribe:t=>(e(t,"[subscribe]"),t(l),c.subscribe("change",t))}},n={fetchOnceDefaultThresholdMs:3e5,isEqual:(t,e)=>t===e};exports.createFetchStore=(c,l=null,a=null,i={})=>{const{fetchOnceDefaultThresholdMs:u,isEqual:o}={...n,...i||{}},h=(t,e)=>"function"==typeof a?a?.(t,e):t,g=s(h(l),i),b=s({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,lastFetchSilentError:null,successCounter:0}),{subscribe:E,get:f}=((n,c,l=null)=>{const a=e=>t(l?.persist)&&l.persist(e),i=s(l?.initialValue),u=[];if(n.forEach((t=>{if(!r(t))throw new TypeError("Expecting array of StoreLike objects");t.subscribe((t=>u.push(t)))()})),!t(c))throw new TypeError("Expecting second argument to be the derivative function");if(!c.length||c.length>2)throw new TypeError("Expecting the derivative function to have exactly 1 or 2 arguments");let o=0,h=[];return{get:i.get,subscribe:t=>{e(t,"[derived.subscribe]"),o++||n.forEach(((t,e)=>{h.push(t.subscribe((t=>{u[e]=t,1===c.length?(i.set(c(u)),a(i.get())):c(u,(t=>{i.set(t),a(i.get())}))})))}));const r=i.subscribe(t);return()=>{--o||(h.forEach((t=>t())),h=[]),r()}}}})([g,b],(([t,e])=>({data:t,...e})));E((()=>null));const p=async(...t)=>{let e=b.get();e.isFetching=!0,e.lastFetchStart=new Date,e.lastFetchEnd=null,e.lastFetchError=null,b.set({...e});try{g.set(h(await c(...t),g.get())),e.successCounter++}catch(t){e.lastFetchError=t}finally{e.isFetching=!1,e.lastFetchEnd=new Date}return b.set({...e}),b.get().lastFetchError?null:g.get()},F=async(...t)=>{let e=b.get(),r=0;e.lastFetchSilentError&&(b.set({...e,lastFetchSilentError:null}),r++);try{g.set(h(await c(...t),g.get()))}catch(t){e.lastFetchSilentError=t,r++}return r&&b.set({...e}),b.get().lastFetchSilentError?null:g.get()};let d;const w=(t=[],e=500)=>(Array.isArray(t)||(t=[t]),F(...t).then((()=>{if(!1===d)return d=void 0;d&&(clearTimeout(d),d=void 0),d=setTimeout((()=>w(t,e)),e)})),()=>{d?(clearTimeout(d),d=void 0):d=!1});return{subscribe:E,get:f,fetch:p,fetchSilent:F,fetchOnce:async(t=[],e=u)=>{const{successCounter:r,isFetching:s,lastFetchStart:n}=b.get();return Array.isArray(t)||(t=[t]),r||s?e&&!s&&n&&Date.now()-new Date(n).valueOf()>e?await p(...t):g.get():await p(...t)},fetchRecursive:w,reset:()=>{g.set(h(l)),b.set({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,lastFetchSilentError:null,successCounter:0})},resetError:()=>b.update((t=>({...t,lastFetchError:null}))),getInternalDataStore:()=>g,fetchWorker:c}};
