// The panacea theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in panacea.settings.json and the generated panacea.settings.ts;
// change them with `astryx experimental theme editor set panacea ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {panaceaSettings} from './panacea.settings';

export const panaceaTheme = defineTheme({
  extends: panaceaSettings,
  name: 'panacea',
});
