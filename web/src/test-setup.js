import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup) // bersihkan DOM antar tes
