import { solveField, type FieldInput } from './elasticField';

onmessage = (e: MessageEvent<FieldInput>) => {
  const r = solveField(e.data);
  postMessage(r, { transfer: [r.field.buffer, r.slopes.buffer, r.sdf.buffer] });
};
