import { Injectable } from "@nestjs/common";
import { AiRepository } from "../repositories/ai.connection";

@Injectable()
export class AiService {
    constructor(
        private readonly aiRepository: AiRepository
    ) {}
}