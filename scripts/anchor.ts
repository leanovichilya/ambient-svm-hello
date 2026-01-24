import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AmbientSvmHello } from "../target/types/ambient_svm_hello";

export function getProgram(): {
  provider: anchor.AnchorProvider;
  program: Program<AmbientSvmHello>;
} {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AmbientSvmHello as Program<AmbientSvmHello>;
  return { provider, program };
}
