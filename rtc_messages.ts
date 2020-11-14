export enum MessageType {
    Offer = 'Offer',
    UserIds = 'UserIds',
    Answer = 'Answer',
    OfferIce = 'OfferIce'
}

export interface BaseRtcMessage {
    type: MessageType
}

interface BaseRtcMessageSender extends BaseRtcMessage {
    toJson: () => string
    to: string
    from: string
}

export class Offer implements BaseRtcMessageSender {
    offer: RTCSessionDescription
    type = MessageType.Offer
    to: string
    from: string

    constructor(offer: RTCSessionDescription, to: string, from: string) {
        this.offer = offer
        this.to = to
        this.from = from
    }

    toJson = (): string => JSON.stringify(this)
}


export class Answer implements BaseRtcMessageSender {
    answer: RTCSessionDescription
    type = MessageType.Answer
    to: string
    from: string

    constructor(answer: RTCSessionDescription, to: string, from: string) {
        this.answer = answer
        this.to = to
        this.from = from
    }

    toJson = (): string => JSON.stringify(this)
}

export class OfferIce implements BaseRtcMessageSender {
    candidate: RTCIceCandidateInit
    type = MessageType.OfferIce
    to: string
    from: string

    constructor(candidate: RTCIceCandidateInit, to: string, from: string) {
        this.candidate = candidate
        this.to = to
        this.from = from
    }

    toJson = (): string => JSON.stringify(this)
}

export interface Ids extends BaseRtcMessage {
    ids: string[]
    self_id: string
}
