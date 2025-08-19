import { BaseEntity } from "../../../database/base/base.entity";
import { JournalEntity } from "../../journal/entites/journal.entity";
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity('users')
export class UserEntity extends BaseEntity {
    @PrimaryGeneratedColumn('increment', {name: 'id', type: 'bigint'})
    id: number;

    @Column({type: "bigint", name: 'telegram_id', unique: true, nullable: false})
    telegramId: number;

    @Column({type: 'text', name: 'username', nullable: true})
    userName?: string;
    
    @OneToMany(() => JournalEntity, (journal) => journal.user) 
    journals: JournalEntity[];
}