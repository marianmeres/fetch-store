"use strict";const t=t=>"function"==typeof t,e=(e,r="")=>{if(!t(e))throw new TypeError(`${r} Expecting function arg`.trim())},r=e=>t(e.subscribe),s=(r,s=null)=>{const n=e=>t(s?.persist)&&s.persist(e);let c=(()=>{const t=new Map,e=e=>(t.has(e)||t.set(e,new Set),t.get(e)),r=(t,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return e(t).add(r),()=>e(t).delete(r)};return{publish:(t,r)=>{e(t).forEach((t=>t(r)))},subscribe:r,subscribeOnce:(t,e)=>{const s=r(t,(t=>{e(t),s()}));return s},unsubscribeAll:e=>t.delete(e)}})(),l=r;n(l);const a=()=>l,u=t=>{l!==t&&(l=t,n(l),c.publish("change",l))};return{set:u,get:a,update:t=>{e(t,"[update]"),u(t(a()))},subscribe:t=>(e(t,"[subscribe]"),t(l),c.subscribe("change",t))}},n={fetchOnceDefaultThresholdMs:3e5};exports.createFetchStore=(c,l=null,a=null,u={})=>{const{fetchOnceDefaultThresholdMs:i}={...n,...u||{}},o=(t,e)=>"function"==typeof a?a?.(t,e):t,h=s(o(l),u),g=s({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,lastFetchSilentError:null,successCounter:0}),{subscribe:b,get:E}=((n,c,l=null)=>{const a=e=>t(l?.persist)&&l.persist(e),u=s(l?.initialValue),i=[];if(n.forEach((t=>{if(!r(t))throw new TypeError("Expecting array of StoreLike objects");t.subscribe((t=>i.push(t)))()})),!t(c))throw new TypeError("Expecting second argument to be the derivative function");if(!c.length||c.length>2)throw new TypeError("Expecting the derivative function to have exactly 1 or 2 arguments");let o=0,h=[];return{get:u.get,subscribe:t=>{e(t,"[derived.subscribe]"),o++||n.forEach(((t,e)=>{h.push(t.subscribe((t=>{i[e]=t,1===c.length?(u.set(c(i)),a(u.get())):c(i,(t=>{u.set(t),a(u.get())}))})))}));const r=u.subscribe(t);return()=>{--o||(h.forEach((t=>t())),h=[]),r()}}}})([h,g],(([t,e])=>({data:t,...e})));b((()=>null));const f=async(...t)=>{let e=g.get();e.isFetching=!0,e.lastFetchStart=new Date,e.lastFetchEnd=null,e.lastFetchError=null,g.set({...e});try{h.set(o(await c(...t),h.get())),e.successCounter++}catch(t){e.lastFetchError=t}finally{e.isFetching=!1,e.lastFetchEnd=new Date}return g.set({...e}),g.get().lastFetchError?null:h.get()},p={subscribe:b,get:E,fetch:f,fetchSilent:async(...t)=>{let e=g.get();e.lastFetchSilentError&&g.set({...e,lastFetchSilentError:null});try{h.set(o(await c(...t),h.get()))}catch(t){g.set({...e,lastFetchSilentError:t})}return g.get().lastFetchSilentError?null:h.get()},fetchOnce:async(t=[],e=i)=>{const{successCounter:r,isFetching:s,lastFetchStart:n}=g.get();return Array.isArray(t)||(t=[t]),r||s?e&&!s&&n&&Date.now()-new Date(n).valueOf()>e?await f(...t):h.get():await f(...t)},reset:()=>{h.set(o(l)),g.set({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,lastFetchSilentError:null,successCounter:0})},resetError:()=>g.update((t=>({...t,lastFetchError:null}))),getInternalDataStore:()=>h};return p};
