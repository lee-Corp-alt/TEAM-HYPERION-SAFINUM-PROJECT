// Dev harness: a mock of the SAFINUM test journey with the real widget mounted through
// the real Shadow DOM path. Used for development and for rehearsing without network.
import { injectLexisFlowUI } from "../src/content/shadow-root";
import { mountMockBank } from "./mock-bank";

mountMockBank(document.getElementById("bank") as HTMLElement);
injectLexisFlowUI();
