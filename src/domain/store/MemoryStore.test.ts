import { MemoryStore } from './MemoryStore'
import { storeContract } from './storeContract'

storeContract('MemoryStore', () => new MemoryStore())
