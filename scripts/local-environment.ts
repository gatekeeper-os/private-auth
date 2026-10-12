import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { BrowserProvider, Contract, ContractFactory, id, type InterfaceAbi } from "ethers";
import { network } from "hardhat";
import solc from "solc";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { AuthorizationGateway } from "../src/gateway.js";
import { EthereumRegistry, REGISTRY_ABI } from "../src/registry.js";
import { createGatewayServer } from "../src/http.js";
import { createRequestKey, present } from "../src/client.js";
import { loadArtifacts } from "../src/artifacts.js";
import type { Challenge, Domain, OperationRequest, Presentation } from "../src/protocol.js";

export async function compileRegistry() {
  const source = await readFile(new URL("../contracts/PermissionRegistry.sol", import.meta.url), "utf8");
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity", sources: { "PermissionRegistry.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
    }
  }))) as {
    errors?: { severity: string; formattedMessage: string }[];
    contracts: Record<string, Record<string, { abi: InterfaceAbi; evm: { bytecode: { object: string } } }>>;
  };
  const errors = output.errors?.filter((error) => error.severity === "error");
  if (errors?.length) throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  const artifact = output.contracts["PermissionRegistry.sol"]?.PermissionRegistry;
  if (!artifact) throw new Error("CONTRACT_COMPILATION_FAILED");
  return artifact;
}

/** Isolated, ephemeral EVM. Uses no real wallet, external RPC, or OpenClaw state. */
export async function localEnvironment() {
  const artifacts = await loadArtifacts();
  const connection = await network.create("local");
  const provider = new BrowserProvider(connection.provider, undefined, { cacheTimeout: -1 });
  const owner = await provider.getSigner(0);
  const stranger = await provider.getSigner(1);
  const artifact = await compileRegistry();
  const deployed = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, owner).deploy(await owner.getAddress());
  await deployed.waitForDeployment();
  const address = await deployed.getAddress();
  const contract = new Contract(address, REGISTRY_ABI, owner);
  const domain: Domain = { chainId: "31337", registry: address, audience: "gatekeeper-demo-catalog", permission: id("catalog:read") };
  const identities = { alice: new Identity(), bob: new Identity(), carol: new Identity(), outsider: new Identity() };
  const enrolled = new Set<keyof typeof identities>(["alice", "bob", "carol"]);
  let group = new Group([...enrolled].map((name) => identities[name].commitment));
  let epoch = 0n;
  async function publish(enabled = true) {
    const nextGroup = new Group([...enrolled].map((name) => identities[name].commitment));
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("BLOCK_UNAVAILABLE");
    const tx = await contract.getFunction("update")(
      domain.permission, epoch, nextGroup.root, block.timestamp + 3600, enabled && enrolled.size > 0
    );
    await tx.wait();
    group = nextGroup;
    epoch++;
  }
  await publish();
  const registry = new EthereumRegistry(provider, domain);
  const gateway = new AuthorizationGateway(domain, registry);
  let executions = 0;
  const server = createGatewayServer(gateway, (request) => {
    executions++;
    return { item: request.item, available: true, specification: "Demonstration catalog data" };
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const listenAddress = server.address();
  if (!listenAddress || typeof listenAddress === "string") throw new Error("LISTEN_FAILED");
  const url = `http://127.0.0.1:${listenAddress.port}`;
  async function post(path: string, payload: unknown) {
    const response = await fetch(`${url}${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }
  async function prepare(name: keyof typeof identities, request: OperationRequest = { operation: "catalog:read", item: "sensor-a" }) {
    const key = createRequestKey();
    const issued = await post("/v1/challenges", { request, publicKey: key.publicKey });
    if (issued.status !== 201) throw new Error(String(issued.body.error));
    const challenge = issued.body as Challenge;
    const presentation = await present({ identity: identities[name], group, challenge, domain, request, key, artifacts });
    return { presentation, challenge, key };
  }
  return {
    connection, provider, owner, stranger, contract, domain, identities, enrolled, registry, gateway,
    server, url, artifacts, post, prepare, publish,
    get group() { return group; }, get epoch() { return epoch; }, get executions() { return executions; },
    execute: (presentation: Presentation) => post("/v1/execute", presentation),
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      provider.destroy();
      await connection.close();
    }
  };
}
