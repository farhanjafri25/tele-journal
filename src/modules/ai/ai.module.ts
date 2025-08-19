import { Module } from "@nestjs/common";
import { AiService } from "./services/ai.service";
import { AiRepository } from "./repositories/ai.connection";

@Module({
    imports: [],
    controllers: [],
    providers: [AiService, AiRepository],
    exports: [AiService, AiRepository],
})
export class AiModule {}