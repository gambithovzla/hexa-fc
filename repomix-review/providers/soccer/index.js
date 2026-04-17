import mockSoccerProvider from './mock-provider.js';
import realSoccerProvider from './real-provider.js';

const PROVIDERS = {
  mock: mockSoccerProvider,
  real: realSoccerProvider,
};

function resolveActiveProviderName() {
  const requestedProvider = String(process.env.SOCCER_DATA_PROVIDER ?? 'mock').trim().toLowerCase();
  if (PROVIDERS[requestedProvider]) return requestedProvider;

  console.warn(`[soccer-provider] Unknown SOCCER_DATA_PROVIDER="${requestedProvider}". Falling back to mock.`);
  return 'mock';
}

// Central selector for future provider swaps.
const ACTIVE_PROVIDER_NAME = resolveActiveProviderName();

const activeSoccerProvider = PROVIDERS[ACTIVE_PROVIDER_NAME];

export { PROVIDERS as soccerProviders, ACTIVE_PROVIDER_NAME as activeSoccerProviderName, activeSoccerProvider };
export default activeSoccerProvider;
