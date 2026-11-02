import { buildPaper } from './paper';

const paper = buildPaper();
postMessage(paper, { transfer: [paper.rest.buffer, paper.uvs.buffer, paper.creased.buffer, ...paper.samples.map((s) => s.buffer)] });
