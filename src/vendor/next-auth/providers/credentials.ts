import type { CredentialsConfig, Provider } from "../types";

export default function CredentialsProvider(config: CredentialsConfig): Provider {
  return {
    ...config,
    id: config.id ?? "credentials",
    type: "credentials",
  };
}
