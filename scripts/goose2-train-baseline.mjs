import fs from 'fs';
import path from 'path';

const datasetPath = path.join(process.cwd(), 'tmp', 'goose2-training-dataset-v1.json');
if (!fs.existsSync(datasetPath)) {
  throw new Error('Missing tmp/goose2-training-dataset-v1.json. Run npm run goose2:export-training first.');
}

const raw = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const rows = Array.isArray(raw.rows) ? raw.rows.slice() : [];
if (!rows.length) throw new Error('Training dataset is empty.');

rows.sort((a, b) => String(a.capture_ts).localeCompare(String(b.capture_ts)));

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values, avg = mean(values)) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
}

function std(values, avg = mean(values)) {
  return Math.sqrt(Math.max(variance(values, avg), 1e-12));
}

function oneHot(value, allowed) {
  return allowed.map((entry) => (value === entry ? 1 : 0));
}

function toNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const sports = [...new Set(rows.map((row) => row.sport))].sort();
const markets = [...new Set(rows.map((row) => row.market_type))].sort();
const books = [...new Set(rows.map((row) => row.book))].sort();

function featureVector(row) {
  return [
    toNumber(row.implied_prob, 0.5),
    toNumber(row.line, 0),
    toNumber(row.odds, 0) / 100,
    row.is_best_price ? 1 : 0,
    row.is_opening ? 1 : 0,
    row.is_closing ? 1 : 0,
    Math.min(toNumber(row.qualifier_count, 0), 10) / 10,
    ...oneHot(row.sport, sports),
    ...oneHot(row.market_type, markets),
    ...oneHot(row.book, books),
  ];
}

const X = rows.map(featureVector);
const y = rows.map((row) => Number(row.label_win));

const trainEnd = Math.max(1, Math.floor(rows.length * 0.7));
const validEnd = Math.max(trainEnd + 1, Math.floor(rows.length * 0.85));

const trainRows = rows.slice(0, trainEnd);
const validRows = rows.slice(trainEnd, validEnd);
const testRows = rows.slice(validEnd);
const trainX = X.slice(0, trainEnd);
const validX = X.slice(trainEnd, validEnd);
const testX = X.slice(validEnd);
const trainY = y.slice(0, trainEnd);
const validY = y.slice(trainEnd, validEnd);
const testY = y.slice(validEnd);

const featureMeans = [];
const featureStds = [];
for (let j = 0; j < trainX[0].length; j++) {
  const column = trainX.map((row) => row[j]);
  const avg = mean(column);
  const s = std(column, avg);
  featureMeans.push(avg);
  featureStds.push(s || 1);
}

function normalize(matrix) {
  return matrix.map((row) => row.map((value, j) => (value - featureMeans[j]) / featureStds[j]));
}

const trainNorm = normalize(trainX);
const validNorm = normalize(validX);
const testNorm = normalize(testX);

function sigmoid(z) {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

const weights = new Array(trainNorm[0].length).fill(0);
let bias = 0;
const learningRate = 0.08;
const epochs = 1200;
const l2 = 0.002;

for (let epoch = 0; epoch < epochs; epoch++) {
  const gradW = new Array(weights.length).fill(0);
  let gradB = 0;

  for (let i = 0; i < trainNorm.length; i++) {
    const pred = sigmoid(dot(weights, trainNorm[i]) + bias);
    const error = pred - trainY[i];
    for (let j = 0; j < weights.length; j++) gradW[j] += error * trainNorm[i][j];
    gradB += error;
  }

  for (let j = 0; j < weights.length; j++) {
    gradW[j] = (gradW[j] / trainNorm.length) + (l2 * weights[j]);
    weights[j] -= learningRate * gradW[j];
  }
  bias -= learningRate * (gradB / trainNorm.length);
}

function predict(matrix) {
  return matrix.map((row) => sigmoid(dot(weights, row) + bias));
}

function logLoss(labels, probs) {
  const eps = 1e-9;
  let total = 0;
  for (let i = 0; i < labels.length; i++) {
    const p = Math.min(1 - eps, Math.max(eps, probs[i]));
    total += -(labels[i] * Math.log(p) + (1 - labels[i]) * Math.log(1 - p));
  }
  return total / labels.length;
}

function brier(labels, probs) {
  let total = 0;
  for (let i = 0; i < labels.length; i++) total += (probs[i] - labels[i]) ** 2;
  return total / labels.length;
}

function accuracy(labels, probs, threshold = 0.5) {
  let correct = 0;
  for (let i = 0; i < labels.length; i++) {
    const pred = probs[i] >= threshold ? 1 : 0;
    if (pred === labels[i]) correct += 1;
  }
  return correct / labels.length;
}

function summarizeSplit(name, splitRows, labels, modelProbs) {
  const impliedProbs = splitRows.map((row) => toNumber(row.implied_prob, 0.5));
  return {
    rows: labels.length,
    win_rate: mean(labels),
    model: {
      log_loss: logLoss(labels, modelProbs),
      brier: brier(labels, modelProbs),
      accuracy_50: accuracy(labels, modelProbs),
      avg_probability: mean(modelProbs),
    },
    implied_baseline: {
      log_loss: logLoss(labels, impliedProbs),
      brier: brier(labels, impliedProbs),
      accuracy_50: accuracy(labels, impliedProbs),
      avg_probability: mean(impliedProbs),
    },
  };
}

const validPred = predict(validNorm);
const testPred = predict(testNorm);
const trainPred = predict(trainNorm);

const report = {
  generated_at: new Date().toISOString(),
  dataset_rows: rows.length,
  split: {
    train: trainRows.length,
    validation: validRows.length,
    test: testRows.length,
    train_range: trainRows.length ? [trainRows[0].capture_ts, trainRows.at(-1).capture_ts] : [],
    validation_range: validRows.length ? [validRows[0].capture_ts, validRows.at(-1).capture_ts] : [],
    test_range: testRows.length ? [testRows[0].capture_ts, testRows.at(-1).capture_ts] : [],
  },
  metrics: {
    train: summarizeSplit('train', trainRows, trainY, trainPred),
    validation: summarizeSplit('validation', validRows, validY, validPred),
    test: summarizeSplit('test', testRows, testY, testPred),
  },
  sample_predictions: testRows.slice(0, 15).map((row, index) => ({
    candidate_id: row.candidate_id,
    sport: row.sport,
    market_type: row.market_type,
    capture_ts: row.capture_ts,
    implied_prob: row.implied_prob,
    model_prob: testPred[index],
    result: row.label_win,
    edge_vs_implied: testPred[index] - toNumber(row.implied_prob, 0.5),
  })),
};

fs.writeFileSync(path.join(process.cwd(), 'tmp', 'goose2-baseline-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
