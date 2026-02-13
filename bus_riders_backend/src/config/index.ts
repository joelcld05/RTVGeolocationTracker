import prod from './prod.config'
import dev from './dev.config'

function getConfig() {
  return process.env.ENVIROMENT === 'prod' ? prod : dev
}

export default getConfig() as any
