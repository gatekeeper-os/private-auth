import { Contract, type Provider } from "ethers";
import type { Domain } from "./protocol.js";

export const REGISTRY_ABI = [
  "function administrator() view returns (address)",
  "function permissions(bytes32) view returns (uint256 root,uint64 epoch,uint64 validUntil,bool enabled)",
  "function update(bytes32,uint64,uint256,uint64,bool)",
  "event PermissionUpdated(bytes32 indexed permission,uint256 root,uint64 epoch,uint64 validUntil,bool enabled)"
];

export interface AuthorizationState {
  root: string;
  epoch: string;
  validUntil: number;
  enabled: boolean;
  blockNumber: number;
}

/** A failed or stale read must throw, never return a cached authorization. */
export interface RegistryReader {
  read(): Promise<AuthorizationState>;
}

/** Reads one configured authority; untrusted clients cannot select a registry. */
export class EthereumRegistry implements RegistryReader {
  constructor(
    private readonly provider: Provider,
    private readonly domain: Domain,
    private readonly maxBlockAgeSeconds = 120,
    private readonly now: () => number = Date.now
  ) {}

  async read(): Promise<AuthorizationState> {
    const network = await this.provider.getNetwork();
    if (network.chainId.toString() !== this.domain.chainId) throw new Error("REGISTRY_UNAVAILABLE");
    const block = await this.provider.getBlock("latest");
    const nowSeconds = Math.floor(this.now() / 1000);
    if (!block || nowSeconds - block.timestamp > this.maxBlockAgeSeconds || block.timestamp > nowSeconds + 30) {
      throw new Error("REGISTRY_UNAVAILABLE");
    }
    // Root, epoch, and expiry are read together at the observed block.
    const contract = new Contract(this.domain.registry, REGISTRY_ABI, this.provider);
    const state = await contract.getFunction("permissions")(this.domain.permission, { blockTag: block.number });
    return {
      root: state.root.toString(), epoch: state.epoch.toString(),
      validUntil: Number(state.validUntil) * 1000, enabled: state.enabled,
      blockNumber: block.number
    };
  }
}
