import {getLlama, LlamaChatSession, LlamaContext} from "node-llama-cpp";
import {fileURLToPath} from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type LlamaResources = {
  llama: any;
  model: any;
  context: any;
};

let llamaResourcesPromise: Promise<LlamaResources> | null = null;

async function initLlamaResources(): Promise<LlamaResources> {
  const llama = await getLlama();
  const model = await llama.loadModel({
    modelPath: path.join(__dirname, "models", "Meta-Llama-3-8B-Instruct.Q4_K_M.gguf")
  });
  const context = await model.createContext();
  return { llama, model, context };
};

export async function getLlamaResources(): Promise<LlamaResources> {
  if (!llamaResourcesPromise) {
    llamaResourcesPromise = initLlamaResources();
  }
  return llamaResourcesPromise;
}

export default class llmManager {
  private static instance : llmManager;
  private llm : LlamaChatSession;

  private constructor(context: LlamaContext) {
    this.llm = new LlamaChatSession({
      contextSequence: context.getSequence()
    });
  }

  public static getInstance(context: LlamaContext) : llmManager{
    if (!llmManager.instance){
      llmManager.instance = new llmManager(context);
    }
    return llmManager.instance;
  }

  public getLLM () : LlamaChatSession{
    return this.llm; 
  }
}

/**
 * Call this to get the initialized Llama resources; initialization runs once.
 */
initLlamaResources();

