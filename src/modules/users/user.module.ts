import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "./entities/user.entity";
import { UserService } from "./services/user.service";
import { UserRepository } from "./repositories/user.repository";

@Module({
    imports: [TypeOrmModule.forFeature([UserEntity])],
    controllers: [],
    providers: [UserService, UserRepository],
    exports: [UserService, UserRepository],
})
export class UserModule {}