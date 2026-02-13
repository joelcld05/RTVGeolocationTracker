import { Server } from 'socket.io'
import _User from './models/_User'
import jwt from 'jsonwebtoken'
import config from '@/config'
import { has } from 'lodash'

class Socket {
  instance: Server
  tempRegistrations: Array<{ nameEvent: string; fc: () => void }> = []

  private conectedUsers: Record<string, any> = {
    total: 0,
    conected: {},
  }

  configure(server: any) {
    this.instance = new Server(server, { cors: { origin: config.cors.origin }, path: '/ws' })
    this.instance.use(function (socket: any, next: any) {
      if (socket?.handshake?.auth?.token) {
        jwt.verify(socket.handshake.auth.token, `${process.env.APP_ID}`, function (err: any, decoded: any) {
          if (err) return next(new Error('Authentication error'))
          socket.user = decoded
          next()
        })
      } else {
        next(new Error('Authentication error'))
      }
    })

    this.instance.on('connection', (socket: any) => {
      this.incrementUser(socket.user._id)
      try {
        socket.on('disconnect', () => {
          this.decrementUser(socket.user._id)
        })
      } catch (error) {}
    })

    for (const fc in this.tempRegistrations) {
      this.instance.on(this.tempRegistrations[fc].nameEvent, this.tempRegistrations[fc].fc)
    }
  }

  registerListeners(nameEvent: string, funcToRegister: any) {
    this.tempRegistrations.push({ nameEvent, fc: funcToRegister })
  }

  async incrementUser(_id: any) {
    this.conectedUsers.total += has(this.conectedUsers.conected, String(_id)) ? 0 : 1
    const totalInUser = (this.conectedUsers.conected[String(_id)] || 0) + 1
    this.conectedUsers.conected[String(_id)] = totalInUser
    if (totalInUser === 1) {
      await _User.updateOne({ _id }, { conected: true })
    }
  }

  async decrementUser(_id: any) {
    this.conectedUsers.conected[String(_id)] -= 1
    const totalInUser = this.conectedUsers.conected[String(_id)]
    if (totalInUser === 0) {
      this.conectedUsers.total -= 1
      delete this.conectedUsers.conected[String(_id)]
      await _User.updateOne({ _id }, { conected: false })
    }
  }

  getTotalConnected() {
    return this.conectedUsers.total
  }

  getIsConnected(user: any) {
    return this.conectedUsers.conected[String(user)]
  }
}

export default new Socket()
