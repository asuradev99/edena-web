/** Small bounded CDP session for browser regressions. Always close in a finally block. */
export async function openPage(port=9555){
  const target=await fetch(`http://localhost:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('CDP connection timed out')),10000);
    socket.onopen=()=>{clearTimeout(timer);resolve();};
    socket.onerror=error=>{clearTimeout(timer);reject(error);};
  });
  let next=0;const pending=new Map();
  socket.onmessage=event=>{
    const message=JSON.parse(event.data),request=pending.get(message.id);
    if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(message.error):request.resolve(message.result);}
  };
  const call=(method,params={},timeout=30000)=>new Promise((resolve,reject)=>{
    const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},timeout);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  return {
    call,
    async evaluate(expression){
      const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    async close(){
      try{await call('Target.closeTarget',{targetId:target.id});}
      finally{socket.close();for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('CDP closed'));}pending.clear();}
    },
  };
}
