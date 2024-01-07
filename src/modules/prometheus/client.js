import { default as client } from 'prom-client';
const collectDefaultMetrics = client.collectDefaultMetrics;
const registry = client.register;

export {
    client,
    collectDefaultMetrics,
    registry
}