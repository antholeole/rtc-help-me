import { BaseRtcMessage, MessageType, Ids, Offer, Answer, OfferIce } from './rtc_messages'
import Event from 'events'

const CHANNEL_NAME = 'GENERAL_DATA_CHANNEL'

const RtcConf: RTCConfiguration = {
    'iceServers':
        [
            { urls: 'stun:stun.sipgate.net:3478' },
            { urls: 'stun:stun.sipgate.net' },
        ],
}

const RtcDataChannelConf: RTCDataChannelInit = {
    ordered: true,
}

export interface IPeerHandler {
    dataChannel?: RTCDataChannel
    inBoundAudioTrack?: MediaStreamTrack
    peerConnection: RTCPeerConnection
    to: string
    complete: boolean
}

export interface IScreenShareTrack {
    inBoundAudioTrack: MediaStreamTrack
    userId: string
}

export class SignalingChannel {
    private socket: WebSocket
    private selfId: string | undefined
    private audioTrack: MediaStreamTrack

    public readonly peerConnections: IPeerHandler[] = []
    public peerConnectionsChanged: Event.EventEmitter

    constructor(groupId: string, audioTrack: MediaStreamTrack) {
        this.socket = new WebSocket(`ws://localhost:3000/signaling/${groupId}`)
        this.audioTrack = audioTrack
        this.socket.onmessage = ((e) => this.onMessage(e.data))
        this.peerConnectionsChanged = new Event.EventEmitter()
    }

    private onMessage(data: string) {
        let baseMessageStr
        try {
            baseMessageStr = JSON.parse(data)
        } catch (e) {
            if (e instanceof SyntaxError) {
                console.error(data, ' in not a valid json')
                return
            }
        }

        if (!baseMessageStr.type || !Object.values(MessageType).includes(baseMessageStr.type)) {
            console.error(data, 'is not a BaseRtcMessage')
            return
        }
        const baseMessage = baseMessageStr as BaseRtcMessage

        switch (baseMessage.type) {
            case MessageType.Offer:
                this.handleOffer(baseMessage as Offer)
                return
            case MessageType.UserIds: {
                const ids = baseMessage as Ids
                this.selfId = ids.self_id
                ids.ids.forEach((id) => this.initalizeRtcPeerConnectionOffer(id))
                return
            }
            case MessageType.Answer:
                this.handleAnswer(baseMessage as Answer)
                return
            case MessageType.OfferIce:
                this.handleIce(baseMessage as OfferIce)
                return
            default:
                console.log(baseMessage)
        }
    }

    public async initalizeRtcPeerConnectionOffer(id: string): Promise<void> {
        const peer = new RTCPeerConnection(RtcConf)

        this.peerConnections.push({
            peerConnection: peer,
            to: id,
            complete: false
        })

        this.establishDataChannels(id)
        this.peerConnectionsChanged.emit('new')


        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)

        this.socket.send(new Offer(peer.localDescription as RTCSessionDescription, id, this.selfId as string).toJson())
    }

    private async handleOffer(offer: Offer) {
        const peer = new RTCPeerConnection(RtcConf)

        this.peerConnections.push({
            peerConnection: peer,
            to: offer.from,
            complete: false
        })

        this.peerConnectionsChanged.emit('new')

        this.establishDataChannels(offer.from)
        await peer.setRemoteDescription(offer.offer)

        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)

        this.socket.send(new Answer(peer.localDescription as RTCSessionDescription, offer.from, this.selfId as string).toJson())
    }

    private async handleAnswer(answer: Answer) {
        const peer = this.getPeer(answer.from)
        await peer.peerConnection.setRemoteDescription(answer.answer)

        peer.peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
                this.socket.send(new OfferIce(e.candidate, answer.from, this.selfId as string).toJson())
            } else {
                console.info('went to null w/ status ' + peer.peerConnection.iceConnectionState)
            }
        }
    }

    private async handleIce(iceOffer: OfferIce) {
        const peer = this.getPeer(iceOffer.from)
        const candidate = new RTCIceCandidate({
            candidate: iceOffer.candidate.candidate as string,
            sdpMLineIndex: iceOffer.candidate.sdpMLineIndex,
            sdpMid: iceOffer.candidate.sdpMid,
            usernameFragment: iceOffer.candidate.usernameFragment
        })

        console.log('CAN TYPE:', candidate.type)
        await peer.peerConnection.addIceCandidate(candidate)
        console.log('added ice candidate')
    }

    private establishDataChannels(id: string) {
        const peer = this.getPeer(id)
        const channel = peer.peerConnection.createDataChannel(CHANNEL_NAME, RtcDataChannelConf)
        peer.dataChannel = channel


        peer.peerConnection.ondatachannel = (dc) => {
            if (peer.dataChannel) {
                peer.peerConnection.ondatachannel = null
            } else {
                peer.dataChannel = dc.channel
            }
        }

        peer.peerConnection.addTrack(this.audioTrack)

        peer.peerConnection.ontrack = (trackEv) => {
            if (trackEv.streams.length > 1) {
                console.warn('given more than one stream on ontrack for peer ' + id + '. Maybe screenshare?')
            } else if (trackEv.streams.length === 0) {
                console.warn('did not get any tracks ontrack for id ' + id)
            }

            peer.inBoundAudioTrack = trackEv.streams[0]?.getAudioTracks()?.shift()
        }
    }


    private getPeer(id: string): IPeerHandler {
        const peer = this.peerConnections.find((pc) => pc.to === id)
        if (!peer) throw Error('tried to get non existant peer')
        return peer
    }
}
