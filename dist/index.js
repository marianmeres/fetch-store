const t=t=>"function"==typeof t,e=(e,r="")=>{if(!t(e))throw new TypeError(`${r} Expecting function arg`.trim())},r=e=>t(e.subscribe),n=(r,n=null)=>{const s=e=>t(n?.persist)&&n.persist(e);let l=(()=>{const t=new Map,e=e=>(t.has(e)||t.set(e,new Set),t.get(e)),r=(t,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return e(t).add(r),()=>e(t).delete(r)};return{publish:(t,r)=>{e(t).forEach((t=>t(r)))},subscribe:r,subscribeOnce:(t,e)=>{const n=r(t,(t=>{e(t),n()}));return n},unsubscribeAll:e=>t.delete(e)}})(),c=r;s(c);const a=()=>c,u=t=>{c!==t&&(c=t,s(c),l.publish("change",c))};return{set:u,get:a,update:t=>{e(t,"[update]"),u(t(a()))},subscribe:t=>(e(t,"[subscribe]"),t(c),l.subscribe("change",t))}},s=(s,l,c=null)=>{const a=e=>t(c?.persist)&&c.persist(e),u=n(c?.initialValue),o=[];if(s.forEach((t=>{if(!r(t))throw new TypeError("Expecting array of StoreLike objects");t.subscribe((t=>o.push(t)))()})),!t(l))throw new TypeError("Expecting second argument to be the derivative function");if(!l.length||l.length>2)throw new TypeError("Expecting the derivative function to have exactly 1 or 2 arguments");let i=0,h=[];return{get:u.get,subscribe:t=>{e(t,"[derived.subscribe]"),i++||s.forEach(((t,e)=>{h.push(t.subscribe((t=>{o[e]=t,1===l.length?(u.set(l(o)),a(u.get())):l(o,(t=>{u.set(t),a(u.get())}))})))}));const r=u.subscribe(t);return()=>{--i||(h.forEach((t=>t())),h=[]),r()}}}},l=t=>"function"==typeof t,c={},a=(t,e=null,r=null,a={})=>{a={...c,...a||{}};const u=(t,e)=>l(r)?r?.(t,e):t,o=n(u(e),a),i=n({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null}),{subscribe:h,get:g}=s([o,i],(([t,e])=>({data:t,...e})));h((()=>null));return{subscribe:h,get:g,fetchStream:(e=[],r=0)=>{let n,s,c=!1,a=()=>{"function"==typeof s?s():console.warn("`abort` is a noop (the fetchStreamWorker did not return a function)."),n&&clearTimeout(n),c=!0};const h=(e=[],r=0)=>{Array.isArray(e)||(e=[e]);const g=l(r)?r():r;i.update((t=>({...t,isFetching:!0,lastFetchStart:new Date,lastFetchEnd:null,lastFetchError:null})));try{s=t(((t,s)=>{i.get().lastFetchError&&i.update((t=>({...t,lastFetchError:null}))),"data"===t?o.set(u(s,o.get())):"error"===t?i.update((t=>({...t,lastFetchError:s}))):"end"===t&&(i.update((t=>({...t,isFetching:!1,lastFetchEnd:new Date}))),g>0&&!c&&(n&&clearTimeout(n),n=setTimeout((()=>{c||(a=h(e,r))}),g)))}),...e)}catch(t){i.update((e=>({...e,lastFetchError:t})))}return a};return h(e,r)},reset:()=>{o.set(u(e)),i.set({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null})},resetError:()=>i.update((t=>({...t,lastFetchError:null}))),getInternalDataStore:()=>o,fetchStreamWorker:t}},u={fetchOnceDefaultThresholdMs:3e5},o=t=>"function"==typeof t,i=(t,e=null,r=null,l={})=>{const{fetchOnceDefaultThresholdMs:c}={...u,...l||{}},a=(t,e)=>o(r)?r?.(t,e):t,i=n(a(e),l),h=n({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,successCounter:0,lastFetchSilentError:null}),{subscribe:g,get:E}=s([i,h],(([t,e])=>({data:t,...e})));g((()=>null));const F=async(...e)=>{let r=h.get();r.isFetching=!0,r.lastFetchStart=new Date,r.lastFetchEnd=null,r.lastFetchError=null,h.set({...r});try{i.set(a(await t(...e),i.get())),r.successCounter++}catch(t){r.lastFetchError=t}finally{r.isFetching=!1,r.lastFetchEnd=new Date}return h.set({...r}),h.get().lastFetchError?null:i.get()},f=async(...e)=>{let r=h.get(),n=0;r.lastFetchSilentError&&(h.set({...r,lastFetchSilentError:null}),n++);try{i.set(a(await t(...e),i.get()))}catch(t){r.lastFetchSilentError=t,n++}return n&&h.set({...r}),h.get().lastFetchSilentError?null:i.get()},b=(t=[],e=500)=>{let r,n=!1;return((t=[],e=500)=>{Array.isArray(t)||(t=[t]);const s=o(e)?e():e;return f(...t).then((()=>{r&&clearTimeout(r),s>0&&!n&&(r=setTimeout((()=>!n&&b(t,e)),s))})),()=>{r&&clearTimeout(r),n=!0}})(t,e)};return{subscribe:g,get:E,fetch:F,fetchSilent:f,fetchOnce:async(t=[],e=c)=>{const{successCounter:r,isFetching:n,lastFetchStart:s}=h.get();return Array.isArray(t)||(t=[t]),r||n?e&&!n&&s&&Date.now()-new Date(s).valueOf()>e?await F(...t):i.get():await F(...t)},fetchRecursive:b,reset:()=>{i.set(a(e)),h.set({isFetching:!1,lastFetchStart:null,lastFetchEnd:null,lastFetchError:null,successCounter:0,lastFetchSilentError:null})},resetError:()=>h.update((t=>({...t,lastFetchError:null}))),getInternalDataStore:()=>i,fetchWorker:t}};export{i as createFetchStore,a as createFetchStreamStore};
