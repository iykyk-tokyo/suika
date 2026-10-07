import { LocalAdapter } from './LocalAdapter';
import type { PlayablesPort } from './PlayablesPort';
import { YtgameAdapter } from './YtgameAdapter';

// `typeof ytgame` のガードはこのファイルに集約する。
export function createPort(): PlayablesPort {
  const inPlayables = typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV;
  if (inPlayables) return new YtgameAdapter();
  return new LocalAdapter(window.localStorage);
}
