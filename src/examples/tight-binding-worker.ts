import {sampleTightBinding} from '../lib/tight-binding-sampling.js';
self.onmessage=event=>{
  try{const sample=sampleTightBinding(event.data.model,event.data.path,event.data.resolution);postMessage({sample});}
  catch(error){postMessage({error:error instanceof Error?error.message:String(error)});}
};
