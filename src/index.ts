export { AuthorizationGateway, AuthorizationError } from "./gateway.js";
export { EthereumRegistry, REGISTRY_ABI } from "./registry.js";
export { createGatewayServer } from "./http.js";
export { createRequestKey, present } from "./client.js";
export { loadArtifacts } from "./artifacts.js";
export type { ProofArtifacts } from "./client.js";
export type { Domain, Challenge, OperationRequest, Presentation } from "./protocol.js";
export type { AuthorizationState, RegistryReader } from "./registry.js";
