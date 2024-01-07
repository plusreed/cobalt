import { client } from '../client.js'

// tracks processing failures by service and reason
const processingFailure = new client.Counter({
    name: 'processing_failure',
    help: 'tracks processing failures by service and reason',
    labelNames: ['service', 'reason'],
})
export default processingFailure;
