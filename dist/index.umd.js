!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self)["fetch-store"]={})}(this,(function(e){"use strict";const t=e=>"function"==typeof e,r=(e,r="")=>{if(!t(e))throw new TypeError(`${r} Expecting function arg`.trim())},n=e=>t(e.subscribe),s=(e=void 0,n=null)=>{const s=e=>t(n?.persist)&&n.persist(e);let c=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return{publish:(e,r={})=>{t(e).forEach((e=>e(r)))},subscribe:r,subscribeOnce:(e,t)=>{const n=r(e,(e=>{t(e),n()}));return n},unsubscribeAll:t=>e.delete(t)}})(),o=e;s(o);const a=()=>o,l=e=>{o!==e&&(o=e,s(o),c.publish("change",o))};return{set:l,get:a,update:e=>{r(e,"[update]"),l(e(a()))},subscribe:e=>(r(e,"[subscribe]"),e(o),c.subscribe("change",e))}},c={fetchOnceDefaultThresholdMs:3e5},o=e=>"function"==typeof e;e.createFetchStore=(e,a=null,l=null,i=null)=>{const{logger:u,onError:h,onSilentError:f,afterCreate:b,fetchOnceDefaultThresholdMs:g}={...c,...i||{}},p=(e,t)=>o(l)?l(e,t):e,d=s(p(a)),E=s({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,successCounter:0}),{subscribe:w,get:y}=((e,c,o=null)=>{const a=e=>t(o?.persist)&&o.persist(e),l=s(o?.initialValue),i=[];if(e.forEach((e=>{if(!n(e))throw new TypeError("Expecting array of StoreLike objects");e.subscribe((e=>i.push(e)))()})),!t(c))throw new TypeError("Expecting second argument to be the derivative function");if(!c.length||c.length>2)throw new TypeError("Expecting the derivative function to have exactly 1 or 2 arguments");let u=0,h=[];return{get:l.get,subscribe:t=>{r(t,"[derived.subscribe]"),u++||e.forEach(((e,t)=>{h.push(e.subscribe((e=>{i[t]=e,1===c.length?(l.set(c(i)),a(l.get())):c(i,(e=>{l.set(e),a(l.get())}))})))}));const n=l.subscribe(t);return()=>{--u||(h.forEach((e=>e())),h=[]),n()}}}})([d,E],(([e,t])=>({data:e,...t})));w((()=>null));const F=async(...t)=>{let r=d.get(),n=E.get();const s=new Date;let c=null;E.set({...n,isFetching:!0,lastFetchStart:s,lastFetchEnd:null,lastFetchError:c});try{r=p(await e(...t),r),n.successCounter++}catch(e){c=e}return d.set(r),E.set({...n,isFetching:!1,lastFetchStart:s,lastFetchEnd:new Date,lastFetchError:c}),c&&o(h)&&h(c),r},S={subscribe:w,get:y,fetch:F,fetchSilent:async(...t)=>{try{let r=p(await e(...t),d.get());return d.set(r),r}catch(e){((...e)=>{o(u)&&u.apply(null,e)})("silent fetch error",e),o(f)&&f(e)}},fetchOnce:async(e=[],t=g)=>{const{successCounter:r,isFetching:n,lastFetchStart:s}=E.get();return Array.isArray(e)||(e=[e]),r||n?t&&!n&&s&&Date.now()-new Date(s).valueOf()>t?await F(...e):void 0:await F(...e)},reset:()=>{d.set(p(a)),E.set({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,successCounter:0})},resetError:()=>E.update((e=>({...e,lastFetchError:null}))),getInternalDataStore:()=>d};return o(b)&&(console?.warn?.("`afterCreate` option is deprecated and will be removed"),b(S)),S}}));
