!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?e(exports):"function"==typeof define&&define.amd?define(["exports"],e):e((t="undefined"!=typeof globalThis?globalThis:t||self)["fetch-store"]={})}(this,(function(t){"use strict";const e=t=>"function"==typeof t,r=(t,r="")=>{if(!e(t))throw new TypeError(`${r} Expecting function arg`.trim())},n=t=>e(t.subscribe),s=(t,n=null)=>{const s=t=>e(n?.persist)&&n.persist(t);let c=(()=>{const t=new Map,e=e=>(t.has(e)||t.set(e,new Set),t.get(e)),r=(t,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return e(t).add(r),()=>e(t).delete(r)};return{publish:(t,r)=>{e(t).forEach((t=>t(r)))},subscribe:r,subscribeOnce:(t,e)=>{const n=r(t,(t=>{e(t),n()}));return n},unsubscribeAll:e=>t.delete(e)}})(),l=t;s(l);const a=()=>l,u=t=>{l!==t&&(l=t,s(l),c.publish("change",l))};return{set:u,get:a,update:t=>{r(t,"[update]"),u(t(a()))},subscribe:t=>(r(t,"[subscribe]"),t(l),c.subscribe("change",t))}},c=(t,c,l=null)=>{const a=t=>e(l?.persist)&&l.persist(t),u=s(l?.initialValue),o=[];if(t.forEach((t=>{if(!n(t))throw new TypeError("Expecting array of StoreLike objects");t.subscribe((t=>o.push(t)))()})),!e(c))throw new TypeError("Expecting second argument to be the derivative function");if(!c.length||c.length>2)throw new TypeError("Expecting the derivative function to have exactly 1 or 2 arguments");let i=0,h=[];return{get:u.get,subscribe:e=>{r(e,"[derived.subscribe]"),i++||t.forEach(((t,e)=>{h.push(t.subscribe((t=>{o[e]=t,1===c.length?(u.set(c(o)),a(u.get())):c(o,(t=>{u.set(t),a(u.get())}))})))}));const n=u.subscribe(e);return()=>{--i||(h.forEach((t=>t())),h=[]),n()}}}},l=t=>"function"==typeof t,a={},u={fetchOnceDefaultThresholdMs:3e5},o=t=>"function"==typeof t;t.createFetchStore=(t,e=null,r=null,n={})=>{const{fetchOnceDefaultThresholdMs:l}={...u,...n||{}},a=(t,e)=>o(r)?r?.(t,e):t,i=s(a(e),n),h=s({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,successCounter:0,lastFetchSilentError:null}),{subscribe:f,get:g}=c([i,h],(([t,e])=>({data:t,...e})));f((()=>null));const F=async(...e)=>{let r=h.get();r.isFetching=!0,r.lastFetchStart=new Date,r.lastFetchEnd=null,r.lastFetchError=null,h.set({...r});try{i.set(a(await t(...e),i.get())),r.successCounter++}catch(t){r.lastFetchError=t}finally{r.isFetching=!1,r.lastFetchEnd=new Date}return h.set({...r}),h.get().lastFetchError?null:i.get()},d=async(...e)=>{let r=h.get(),n=0;r.lastFetchSilentError&&(h.set({...r,lastFetchSilentError:null}),n++);try{i.set(a(await t(...e),i.get()))}catch(t){r.lastFetchSilentError=t,n++}return n&&h.set({...r}),h.get().lastFetchSilentError?null:i.get()},E=(t=[],e=500)=>{let r,n=!1;return((t=[],e=500)=>{Array.isArray(t)||(t=[t]);const s=o(e)?e():e;return d(...t).then((()=>{r&&clearTimeout(r),s>0&&!n&&(r=setTimeout((()=>!n&&E(t,s)),s))})),()=>{r&&clearTimeout(r),n=!0}})(t,e)};return{subscribe:f,get:g,fetch:F,fetchSilent:d,fetchOnce:async(t=[],e=l)=>{const{successCounter:r,isFetching:n,lastFetchStart:s}=h.get();return Array.isArray(t)||(t=[t]),r||n?e&&!n&&s&&Date.now()-new Date(s).valueOf()>e?await F(...t):i.get():await F(...t)},fetchRecursive:E,reset:()=>{i.set(a(e)),h.set({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,successCounter:0,lastFetchSilentError:null})},resetError:()=>h.update((t=>({...t,lastFetchError:null}))),getInternalDataStore:()=>i,fetchWorker:t}},t.createFetchStreamStore=(t,e=null,r=null,n={})=>{n={...a,...n||{}};const u=(t,e)=>l(r)?r?.(t,e):t,o=s(u(e),n),i=s({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null}),{subscribe:h,get:f}=c([o,i],(([t,e])=>({data:t,...e})));h((()=>null));return{subscribe:h,get:f,fetchStream:(e=[],r=0)=>{let n,s=!1;const c=(e=[],r=0)=>{Array.isArray(e)||(e=[e]);const a=l(r)?r():r;let h;i.update((t=>({...t,isFetching:!0,lastFetchStart:new Date,lastFetchEnd:null,lastFetchError:null})));try{h=t(((t,r)=>{i.get().lastFetchError&&i.update((t=>({...t,lastFetchError:null}))),"data"===t?o.set(u(r,o.get())):"error"===t?i.update((t=>({...t,lastFetchError:r}))):"end"===t&&(i.update((t=>({...t,isFetching:!1,lastFetchEnd:new Date}))),a>0&&!s&&(n&&clearTimeout(n),n=setTimeout((()=>!s&&c(e,a)),a)))}),...e)}catch(t){i.update((e=>({...e,lastFetchError:t})))}return()=>{"function"==typeof h?h():console.warn("`abort` is a noop (the fetchStreamWorker did not return a function)."),n&&clearTimeout(n),s=!0}};return c(e,r)},reset:()=>{o.set(u(e)),i.set({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null})},resetError:()=>i.update((t=>({...t,lastFetchError:null}))),getInternalDataStore:()=>o,fetchStreamWorker:t}}}));
