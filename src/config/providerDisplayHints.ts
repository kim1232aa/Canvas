/**
 * Display-only hints keyed by schema-provider id. No request mapping lives here.
 * upstreamEchoPath: dotted path into the upstream POST/poll JSON where the provider echoes the accepted input.
 * Must match schemaProviders[id].upstreamEchoPath when set.
 */
export const PROVIDER_UPSTREAM_ECHO_PATH: Record<string, string> = {
  wavespeed: 'data.input',
};
