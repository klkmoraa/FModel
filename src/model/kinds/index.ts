import { registerAnnotationKinds } from './annotation';
import { registerBasicKinds } from './basic';
import { registerHatchKind } from './hatch';
import { registerInsertKinds } from './insert';
import { registerMediaKinds } from './media';
import { registerPolylineKinds } from './polylines';
import { registerTextKinds } from './text';

let registered = false;

export function registerAllKinds() {
  if (registered) return;
  registered = true;
  registerBasicKinds();
  registerPolylineKinds();
  registerHatchKind();
  registerTextKinds();
  registerAnnotationKinds();
  registerInsertKinds();
  registerMediaKinds();
}
