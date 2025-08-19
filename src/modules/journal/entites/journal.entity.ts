import { BaseEntity } from "../../../database/base/base.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { Column, Entity, PrimaryGeneratedColumn, ColumnOptions, ManyToOne } from "typeorm";


@Entity('journal')
export class JournalEntity extends BaseEntity {
    @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
    id: number;

    @Column({ type: 'bigint', name: 'user_id', nullable: false })
    userId: number;

    @Column({ type: 'text', name: 'journal_entry', nullable: false })
    entry: string;

    @Column({type: 'text', array: true, nullable  : true, default: []})
    tags?: string[];

    @Column({type: 'real_vector', array: true, nullable: true})
    embeddings?: number[];

    @ManyToOne(() => UserEntity, (user) => user.journals, {
        onDelete: 'CASCADE',})
    user: UserEntity;
}