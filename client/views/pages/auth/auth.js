import React from 'react'
import PropTypes from 'prop-types'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Ed25519 from 'nanocurrency-web/dist/lib/ed25519'
import Convert from 'nanocurrency-web/dist/lib/util/convert'

import Button from '@views/components/primitives/Button/Button.js'
import { COLORS } from '@theme/colors.js'
import './auth.styl'

function generate_key_pair() {
  const array = new Uint8Array(32)
  const user_private_key = Convert.ab2hex(crypto.getRandomValues(array))
  const keys = new Ed25519().generateKeys(user_private_key)
  return {
    user_private_key,
    user_public_key: keys.publicKey.toString('hex')
  }
}

function get_keypair_from_private_key(user_private_key) {
  user_private_key = user_private_key.replace(/\s/g, '')
  const keys = new Ed25519().generateKeys(user_private_key)
  return {
    user_private_key: keys.privateKey.toString('hex'),
    user_public_key: keys.publicKey.toString('hex')
  }
}

export default function AuthPage({
  load_from_new_keypair,
  load_from_private_key,
  user_private_key
}) {
  const generateKey = () => {
    const keypair = generate_key_pair()
    load_from_new_keypair(keypair)
  }

  const handle_change = (object) => {
    const keypair = get_keypair_from_private_key(object.target.value)
    load_from_private_key(keypair)
  }

  if (user_private_key) {
    const keypair = get_keypair_from_private_key(user_private_key)
    const first = user_private_key.slice(0, 8)
    const middle = user_private_key.slice(8, -8).match(/.{1,8}/g)
    const last = user_private_key.slice(-8)

    return (
      <Container maxWidth='md' className='home__container'>
        <div className='private_key_description'>
          <h1>Keypair Generated</h1>
          <div>Your private key provides access to your account</div>
        </div>
        <div className='private_key_container'>
          <div className='private_key_text highlight'>{first}</div>
          {middle.map((t, i) => (
            <div className='private_key_text' key={i}>
              {t}
            </div>
          ))}
          <div className='private_key_text highlight'>{last}</div>
        </div>
        <div className='access_instructions'>
          <h2>To Access the System</h2>
          <p>
            Share your <strong>public key</strong> with the administrator to be
            granted access:
          </p>
          <div className='public_key_display'>
            <TextField
              label='Public Key'
              value={keypair.user_public_key}
              variant='outlined'
              fullWidth
              InputProps={{
                readOnly: true
              }}
              helperText='Share this public key with the administrator'
            />
          </div>
          <p>
            Once your public key has been added to the system, you can
            authenticate using your private key.
          </p>
        </div>
      </Container>
    )
  }

  return (
    <Container maxWidth='md' className='home__container'>
      <Stack
        direction='column'
        spacing={2}
        divider={<Divider orientation='horizontal' flexItem />}>
        <div>
          <Button variant='primary' onClick={generateKey}>
            Generate New Keypair
          </Button>
          <p style={{ marginTop: '8px', fontSize: '14px', color: COLORS.text_secondary }}>
            Create a new cryptographic keypair for authentication
          </p>
        </div>
        <div>
          <TextField
            id='outlined-basic'
            label='Private Key'
            variant='outlined'
            helperText='Enter your existing private key to authenticate'
            onChange={handle_change}
            fullWidth
          />
        </div>
      </Stack>
    </Container>
  )
}

AuthPage.propTypes = {
  load_from_new_keypair: PropTypes.func.isRequired,
  load_from_private_key: PropTypes.func.isRequired,
  user_private_key: PropTypes.string
}
