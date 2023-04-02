import express from 'express'

const router = express.Router()

router.get('/?', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { folder_path } = req.query

    // TODO

    res.status(200).send({})
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
