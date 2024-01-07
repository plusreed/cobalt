import { default as client } from 'prom-client';
const registry = client.register;

export {
    client,
    registry
}