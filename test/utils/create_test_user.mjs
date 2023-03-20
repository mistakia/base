import crypto from 'crypto'
import ed25519 from '@trashman/ed25519-blake2b'

import db from '#db'

export default async function () {
  const private_key = crypto.randomBytes(32)
  const public_key = ed25519.publicKey(private_key)

  const data = {
    public_key: public_key.toString('hex'),
    username: 'test_user',
    email: 'test@test.com'
  }
  const [user_id] = await db('users').insert(data)
  const user = await db('users').where('user_id', user_id).first()

  return {
    private_key,
    ...user
  }
}
