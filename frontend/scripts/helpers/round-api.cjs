const { load } = require('./render-feature.cjs');
const errors = load('shared/api/errors.ts');
function roundApi(request = async () => { throw Error('Unexpected request'); }, enabled = true) {
  return load('features/sessions/api/round.ts', {
    '@/shared/api/client': { request }, '@/shared/api/errors': errors,
    '@/shared/api/config': { USE_MOCK: enabled },
  }, { process: { env: {} } });
}
module.exports = { roundApi };
